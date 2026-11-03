// Moments data-layer check against a LOCAL Supabase.
//   node scripts/verify/moments.mjs
// Prints "MOMENTS VERIFY PASSED" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '')) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${URL_})`)
  process.exit(1)
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const created = []
async function signUp(client, tag) {
  const { data } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (data?.user) created.push(data.user.id)
  return data.user.id
}
const jpeg = new Blob([readFileSync(join(here, 'fixtures', 'moment-gps.jpg'))], { type: 'image/jpeg' })

async function main() {
  const a = mk(), b = mk(), c = mk()
  const aid = await signUp(a, 'ma'), bid = await signUp(b, 'mb')
  await signUp(c, 'mc')
  const { data: couple } = await a.rpc('create_couple')
  await b.rpc('join_couple', { p_code: couple.invite_code })
  const cid = couple.id

  const base = { couple_id: cid, created_by: aid, title: 'Dinner di Monas', moment_date: '2026-09-14', location_name: 'Monas, Gambir', latitude: -6.175392, longitude: 106.827153, description: 'Makan malam pertama' }
  const { data: moment, error: mE } = await a.from('moments').insert(base).select().single()
  ok('create moment', !mE && moment?.id, mE?.message)
  const mid = moment.id

  const { error: halfCoords } = await a.from('moments').insert({ ...base, longitude: null })
  ok('lat without lng rejected', !!halfCoords)
  const { error: emptyTitle } = await a.from('moments').insert({ ...base, title: '   ' })
  ok('blank title rejected', !!emptyTitle)

  // Upload 7 photos as the creator.
  const paths = []
  for (let i = 0; i < 7; i++) {
    const path = `${cid}/${mid}/p${i}.jpg`
    const { error: upE } = await a.storage.from('moments').upload(path, jpeg, { contentType: 'image/jpeg' })
    const { error: rowE } = await a.from('moment_photos').insert({ moment_id: mid, couple_id: cid, storage_path: path, sort_order: i, width: 800, height: 600 })
    if (upE || rowE) failures.push(`photo ${i}: ${upE?.message ?? rowE?.message}`)
    paths.push(path)
  }
  const { error: eighthE } = await a.from('moment_photos').insert({ moment_id: mid, couple_id: cid, storage_path: `${cid}/${mid}/p7.jpg`, sort_order: 7 })
  ok('8th photo rejected by DB', /Maksimal 7/.test(eighthE?.message ?? ''), eighthE?.message)
  const { error: wrongFolder } = await a.from('moment_photos').insert({ moment_id: mid, couple_id: cid, storage_path: `${cid}/other/x.jpg` })
  ok('photo path outside moment folder rejected', !!wrongFolder)

  // Concurrency: a fresh moment receiving 3 parallel inserts on top of 6 keeps the cap at 7.
  const { data: m2 } = await a.from('moments').insert({ ...base, title: 'Race' }).select().single()
  for (let i = 0; i < 6; i++) await a.from('moment_photos').insert({ moment_id: m2.id, couple_id: cid, storage_path: `${cid}/${m2.id}/r${i}.jpg` })
  await Promise.all([0, 1, 2].map((i) => b.from('moment_photos').insert({ moment_id: m2.id, couple_id: cid, storage_path: `${cid}/${m2.id}/z${i}.jpg` })))
  const { count: raceCount } = await a.from('moment_photos').select('*', { count: 'exact', head: true }).eq('moment_id', m2.id)
  ok('cap holds under parallel inserts', raceCount === 7, `count=${raceCount}`)

  // Partner sees everything and can open photos.
  const { data: bList } = await b.from('moments').select('id, moment_photos(id)').eq('couple_id', cid)
  ok('partner lists moments', bList?.length === 2)
  const { data: signed } = await b.storage.from('moments').createSignedUrls(paths.slice(0, 2), 60)
  const fetched = await fetch(signed?.[0]?.signedUrl ?? 'http://invalid')
  ok('partner signed URL downloads', fetched.status === 200 && (fetched.headers.get('content-type') ?? '').includes('image'), `status ${fetched.status}`)
  const { error: bUpdateE } = await b.from('moments').update({ title: 'Dinner di Monas (edit)' }).eq('id', mid)
  ok('partner can edit', !bUpdateE, bUpdateE?.message)

  // Photo rows send no live events, so the form touches the moment after its
  // uploads; the list treats "photos newer than updated_at" as still uploading.
  const newestPhoto = async (id) => {
    const { data } = await a.from('moment_photos').select('created_at').eq('moment_id', id)
    return Math.max(...(data ?? []).map((p) => Date.parse(p.created_at)))
  }
  const { data: m2Before } = await a.from('moments').select('updated_at').eq('id', m2.id).single()
  ok('photos added after the moment are newer than its updated_at', (await newestPhoto(m2.id)) > Date.parse(m2Before?.updated_at))
  const { error: touchE } = await b.from('moments').update({ updated_at: new Date().toISOString() }).eq('id', m2.id)
  const { data: m2After } = await a.from('moments').select('updated_at').eq('id', m2.id).single()
  ok('partner touching a moment moves updated_at past its photos', !touchE && Date.parse(m2After?.updated_at) > (await newestPhoto(m2.id)), touchE?.message)

  // Outsider sees nothing.
  const { data: cList } = await c.from('moments').select('id').eq('couple_id', cid)
  ok('outsider sees no moments', (cList ?? []).length === 0)
  const { data: cPhotos } = await c.from('moment_photos').select('id').eq('couple_id', cid)
  ok('outsider sees no photo rows', (cPhotos ?? []).length === 0)
  const { error: cDl } = await c.storage.from('moments').download(paths[0])
  ok('outsider cannot download', !!cDl)
  const { data: cSigned } = await c.storage.from('moments').createSignedUrl(paths[0], 60)
  ok('outsider cannot sign URL', !cSigned?.signedUrl)
  const { error: cUp } = await c.storage.from('moments').upload(`${cid}/${mid}/evil.jpg`, jpeg, { contentType: 'image/jpeg' })
  ok('outsider cannot upload into couple folder', !!cUp)
  const { error: cIns } = await c.from('moments').insert({ ...base, created_by: undefined })
  ok('outsider cannot create moment for couple', !!cIns)

  // Bucket is private: the public URL must not serve the file.
  const { data: pub } = a.storage.from('moments').getPublicUrl(paths[0])
  const pubRes = await fetch(pub.publicUrl)
  ok('public URL does not serve photo', pubRes.status !== 200, `status ${pubRes.status}`)
  const { error: mimeE } = await a.storage.from('moments').upload(`${cid}/${mid}/x.txt`, new Blob(['hi'], { type: 'text/plain' }), { contentType: 'text/plain' })
  ok('non-image upload rejected', !!mimeE)

  // Delete: files first, then the row cascades photo rows.
  const { data: files } = await a.storage.from('moments').list(`${cid}/${mid}`)
  await a.storage.from('moments').remove((files ?? []).map((f) => `${cid}/${mid}/${f.name}`))
  const { error: delE } = await a.from('moments').delete().eq('id', mid)
  ok('delete moment', !delE, delE?.message)
  const { count: left } = await admin.from('moment_photos').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  ok('photo rows cascade-deleted', left === 0, `left=${left}`)
  const { data: filesAfter } = await admin.storage.from('moments').list(`${cid}/${mid}`)
  ok('storage folder emptied', (filesAfter ?? []).length === 0, `files=${filesAfter?.length}`)

  await admin.from('moments').delete().eq('id', m2.id)
}

try { await main() } catch (e) { failures.push(`crash: ${e.message}`) }
finally { for (const id of created) await admin.auth.admin.deleteUser(id) }

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('MOMENTS VERIFY PASSED')
