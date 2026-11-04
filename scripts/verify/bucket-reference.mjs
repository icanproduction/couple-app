// Bucket list reference link + picture against a LOCAL Supabase.
//   node scripts/verify/bucket-reference.mjs
// Throwaway users through the admin API: A + B (partners), C (outsider in
// another couple), E (alone, for the couple-deletion sweep). Exercises the
// app's own helpers in src/lib/bucket.ts (runtime-import-free) and proves the
// rules with negative tests: link validation in the client and in the DB,
// pictures only inside the own couple's <couple>/<item>/<file>.jpg folder,
// partner can read, outsider and anon can't read/list/upload/remove, no
// overwrite, replace/remove leave no orphan, a conflicting edit or a failed
// row write removes its upload, deleting an item removes its folder, a
// deleted couple's pictures are swept, and items without link/picture behave
// as before. Prints "bucket reference verification passed" only when every
// check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// Node notes that bucket.ts is ESM in a package without "type": "module"
// (harmless). Drop only that notice so the last line stays the verdict.
const printers = process.listeners('warning')
process.removeAllListeners('warning')
process.on('warning', (w) => { if (w?.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const p of printers) p(w) })
const {
  BUCKET_LINK_MAX, BUCKET_PICTURES, BucketPictureConflictError, bucketPicturePath, bucketProgress, createBucketItem,
  deleteBucketItem, isMapLink, linkLabel, listBucketItems, momentPrefillHref, normalizeReferenceUrl,
  removeCoupleBucketPictures, saveBucketItem, setBucketDone, signBucketPictures, updateBucketItem, validateBucketInput,
} = await import('../../src/lib/bucket.ts')

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

// ---------- local Supabase only ----------
const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u ?? '')
function readEnvFile(f) {
  const p = join(root, f)
  const out = {}
  if (!existsSync(p)) return out
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
// Take the keys from one file that points at the local stack (never mix a
// local URL with keys from a hosted project's file).
let env = null
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const e = readEnvFile(f)
  if (isLocal(e.NEXT_PUBLIC_SUPABASE_URL) && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY) env = e
}
if (!env) {
  const s = spawnSync('supabase', ['status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
  const e = {}
  for (const line of (s.stdout ?? '').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
    if (m) e[m[1]] = m[2]
  }
  if (isLocal(e.API_URL) && e.ANON_KEY && e.SERVICE_ROLE_KEY) {
    env = { NEXT_PUBLIC_SUPABASE_URL: e.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: e.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: e.SERVICE_ROLE_KEY }
  }
}
if (!env) {
  console.error('Refusing to run: no local Supabase URL + keys found (.env*.local or `supabase status`)')
  process.exit(1)
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anonClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

// ---------- tiny harness ----------
let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' :: ' + extra : ''}`) }
const created = []
const couples = new Set()
const describe = (r) => r?.error ? `${r.error.code ?? r.error.statusCode ?? ''} ${r.error.message}` : `data=${JSON.stringify(r?.data)?.slice(0, 160)}`
const throwsAsync = async (fn) => { try { await fn(); return null } catch (e) { return e } }
const uuid = () => crypto.randomUUID()

// A real (tiny) JPEG; Storage checks the declared type, the bytes keep it honest.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
const jpeg = () => new Blob([JPEG], { type: 'image/jpeg' })

async function makeUser(tag, name) {
  const email = `br-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  created.push(data.user.id)
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`)
  return { client, id: data.user.id }
}

const store = (client) => client.storage.from(BUCKET_PICTURES)
/** Every file path under a couple folder, through the service role. */
async function filesUnder(prefix) {
  const out = []
  const { data: top } = await store(admin).list(prefix, { limit: 1000 })
  for (const e of top ?? []) {
    if (e.id === null) {
      const { data: inner } = await store(admin).list(`${prefix}/${e.name}`, { limit: 1000 })
      for (const f of inner ?? []) if (f.id !== null) out.push(`${prefix}/${e.name}/${f.name}`)
    } else {
      out.push(`${prefix}/${e.name}`)
    }
  }
  return out.sort()
}
const exists = async (path) => {
  const i = path.lastIndexOf('/')
  const { data } = await store(admin).list(path.slice(0, i), { limit: 1000, search: path.slice(i + 1) })
  return (data ?? []).some((f) => f.name === path.slice(i + 1))
}
const rowOf = async (id) => (await admin.from('bucket_items').select('*').eq('id', id).maybeSingle()).data
const base = (title, extra = {}) => ({ title, note: null, category: 'kuliner', estimated_cost: null, ...extra })

async function main() {
  const A = await makeUser('a', 'Ayu')
  const B = await makeUser('b', 'Bima')
  const C = await makeUser('c', 'Citra')
  const E = await makeUser('e', 'Eka')
  const anon = anonClient()

  const c1 = await A.client.rpc('create_couple')
  if (c1.error) throw new Error(`create_couple A: ${c1.error.message}`)
  couples.add(c1.data.id)
  const j1 = await B.client.rpc('join_couple', { p_code: c1.data.invite_code })
  if (j1.error) throw new Error(`join_couple B: ${j1.error.message}`)
  const c2 = await C.client.rpc('create_couple')
  if (c2.error) throw new Error(`create_couple C: ${c2.error.message}`)
  couples.add(c2.data.id)
  const cE = await E.client.rpc('create_couple')
  if (cE.error) throw new Error(`create_couple E: ${cE.error.message}`)
  couples.add(cE.data.id)
  const cid = c1.data.id
  const cid2 = c2.data.id

  // ---------- 1. link validation in the app ----------
  const accepts = [
    ['https://www.instagram.com/p/C1abc/', 'https://www.instagram.com/p/C1abc/'],
    ['http://example.com/menu', 'http://example.com/menu'],
    ['  https://maps.app.goo.gl/AbC123  ', 'https://maps.app.goo.gl/AbC123'],
    ['tiktok.com/@kita/video/1', 'https://tiktok.com/@kita/video/1'],
    ['HTTPS://Example.COM/Path', 'https://example.com/Path'],
    ['Look at this place https://vt.tiktok.com/ZS9abc/. So good', 'https://vt.tiktok.com/ZS9abc/'],
  ]
  for (const [input, want] of accepts) {
    const r = normalizeReferenceUrl(input)
    ok(`link accepted: ${input.trim().slice(0, 40)}`, r.error === null && r.url === want, JSON.stringify(r))
  }
  const overlong = `https://example.com/${'a'.repeat(BUCKET_LINK_MAX)}`
  const rejects = ['javascript:alert(1)', 'JavaScript:alert(document.cookie)', ' javascript:void(0) ', 'ftp://files.example.com/a.zip',
    'data:text/html;base64,PHNjcmlwdD4=', 'mailto:hi@example.com', 'file:///etc/passwd', overlong, 'not a link', 'https://localhost/x',
    'https://user:pw@example.com/']
  for (const input of rejects) {
    const r = normalizeReferenceUrl(input)
    ok(`link rejected: ${input.trim().slice(0, 40)}`, r.url === null && typeof r.error === 'string' && r.error.length > 0, JSON.stringify(r).slice(0, 120))
  }
  ok('rejection messages are plain English with no em dash', rejects.every((i) => !/—/.test(normalizeReferenceUrl(i).error ?? '—') && /^[A-Z]/.test(normalizeReferenceUrl(i).error)))
  ok('overlong link names the limit', /2000/.test(normalizeReferenceUrl(overlong).error ?? ''))
  ok('empty link means no link, no error', ['', '   ', null, undefined].every((v) => { const r = normalizeReferenceUrl(v); return r.url === null && r.error === null }))
  ok('validateBucketInput: old shape still valid', validateBucketInput(base('Old style')) === null)
  ok('validateBucketInput: bad link refused, good link and empty link fine',
    validateBucketInput(base('x', { reference_url: 'javascript:alert(1)' })) !== null
    && validateBucketInput(base('x', { reference_url: 'ftp://x.com' })) !== null
    && validateBucketInput(base('x', { reference_url: 'https://x.com' })) === null
    && validateBucketInput(base('x', { reference_url: '' })) === null
    && validateBucketInput(base('x', { reference_url: null })) === null)
  ok('link labels read like site names', linkLabel('https://www.instagram.com/p/x') === 'instagram.com' && linkLabel('https://m.tiktok.com/v/1') === 'tiktok.com'
    && linkLabel('https://maps.app.goo.gl/x') === 'Google Maps' && linkLabel('https://www.google.com/maps/place/x') === 'Google Maps'
    && linkLabel('https://maps.apple.com/?q=x') === 'Apple Maps' && linkLabel('https://goo.gl/abc') === 'goo.gl')
  ok('map links are recognised', isMapLink('https://maps.app.goo.gl/x') && isMapLink('https://goo.gl/maps/x') && !isMapLink('https://instagram.com/maps'))
  let badPath = 0
  for (const args of [['../x', uuid()], [cid, '../../etc'], [cid, uuid(), '../a'], [`${cid}/x`, uuid()]]) {
    try { bucketPicturePath(...args) } catch { badPath++ }
  }
  ok('bucketPicturePath refuses anything that is not a uuid', badPath === 4)
  ok('bucketPicturePath shape', new RegExp(`^${cid}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$`).test(bucketPicturePath(cid, uuid())))

  // ---------- 2. link rules in the DB (direct writes skip the app) ----------
  for (const [label, url] of [['javascript:', 'javascript:alert(1)'], ['ftp:', 'ftp://x.com/a'], ['overlong', `https://x.com/${'a'.repeat(2000)}`],
    ['with a space', 'https://x.com/a b'], ['no host', 'https://'], ['mixed-case javascript', 'JaVaScRiPt:alert(1)']]) {
    const r = await A.client.from('bucket_items').insert({ couple_id: cid, created_by: A.id, title: `bad link ${label}`, reference_url: url })
    ok(`DB refuses a ${label} link`, r.error?.code === '23514', describe(r))
  }
  const goodDirect = await A.client.from('bucket_items').insert({ couple_id: cid, created_by: A.id, title: 'good link', reference_url: 'https://x.com/ok' }).select().single()
  ok('DB accepts an https link', !goodDirect.error && goodDirect.data?.reference_url === 'https://x.com/ok', describe(goodDirect))

  // ---------- 3. link through the helpers ----------
  const linked = await createBucketItem(A.client, cid, A.id, base('  Ramen spot  ', { reference_url: '  instagram.com/p/ramen  ' }))
  ok('create stores the normalised link', linked.reference_url === 'https://instagram.com/p/ramen' && linked.title === 'Ramen spot' && linked.image_path === null, JSON.stringify(linked))
  const keptLink = await updateBucketItem(B.client, linked.id, base('Ramen spot (B)'))
  ok('update without a link keeps the link', keptLink.reference_url === 'https://instagram.com/p/ramen' && keptLink.title === 'Ramen spot (B)')
  const changedLink = await updateBucketItem(B.client, linked.id, base('Ramen spot (B)', { reference_url: 'https://maps.app.goo.gl/ramen' }))
  ok('partner can change the link', changedLink.reference_url === 'https://maps.app.goo.gl/ramen')
  const badUpdate = await throwsAsync(() => updateBucketItem(A.client, linked.id, base('Hijack', { reference_url: 'javascript:alert(1)' })))
  ok('update with a bad link throws a readable error', badUpdate && /web links/.test(badUpdate.message), badUpdate?.message)
  ok('a refused update changes nothing', (await rowOf(linked.id))?.title === 'Ramen spot (B)' && (await rowOf(linked.id))?.reference_url === 'https://maps.app.goo.gl/ramen')
  const badCreate = await throwsAsync(() => createBucketItem(A.client, cid, A.id, base('Bad', { reference_url: 'ftp://x.com' })))
  ok('create with a bad link throws (never saves it as "no link")', !!badCreate)
  const cleared = await updateBucketItem(A.client, linked.id, base('Ramen spot', { reference_url: '' }))
  ok('an emptied link field clears the link', cleared.reference_url === null)
  const cUpd = await C.client.from('bucket_items').update({ reference_url: 'https://evil.example.com/' }).eq('id', linked.id).select()
  ok('outsider cannot set a link on the couple\'s item', (cUpd.data ?? []).length === 0 && (await rowOf(linked.id))?.reference_url === null, describe(cUpd))

  // ---------- 4. picture: upload, partner reads, outsider and anon can't ----------
  const withPic = await saveBucketItem(A.client, {
    coupleId: cid, userId: A.id, existing: null, input: base('Sunset picnic', { reference_url: 'https://maps.app.goo.gl/picnic' }), picture: { kind: 'set', blob: jpeg() },
  })
  const p1 = withPic.image_path
  ok('create with a picture stores it in the item\'s own folder', typeof p1 === 'string' && p1.startsWith(`${cid}/${withPic.id}/`) && p1.endsWith('.jpg'), String(p1))
  ok('the file is in storage', await exists(p1))
  ok('the link is saved alongside', withPic.reference_url === 'https://maps.app.goo.gl/picnic')

  const bDown = await store(B.client).download(p1)
  ok('partner B can download the picture', !bDown.error && bDown.data?.size === JPEG.length, describe(bDown))
  const bSigned = await signBucketPictures(B.client, [p1])
  ok('partner B gets a signed URL', !!bSigned[p1]?.url && bSigned[p1].expiresAt > Date.now())
  const fetched = bSigned[p1] ? await fetch(bSigned[p1].url) : null
  ok('the signed URL serves the picture', fetched?.status === 200 && (await fetched.arrayBuffer()).byteLength === JPEG.length, String(fetched?.status))
  const bList = await store(B.client).list(`${cid}/${withPic.id}`)
  ok('partner B can list the item folder', !bList.error && (bList.data ?? []).length === 1, describe(bList))

  const cDown = await store(C.client).download(p1)
  ok('outsider C cannot download', !!cDown.error, describe(cDown))
  const cSigned = await throwsAsync(async () => { const s = await signBucketPictures(C.client, [p1]); if (s[p1]) throw new Error('signed') })
  const cSignRaw = await store(C.client).createSignedUrl(p1, 60)
  ok('outsider C cannot sign a URL', (cSigned === null || !/signed/.test(cSigned.message)) && !cSignRaw.data?.signedUrl, describe(cSignRaw))
  const cList = await store(C.client).list(`${cid}/${withPic.id}`)
  const cListTop = await store(C.client).list(cid)
  ok('outsider C lists nothing in the couple folder', (cList.data ?? []).length === 0 && (cListTop.data ?? []).length === 0, describe(cList))
  const cUp = await store(C.client).upload(`${cid}/${withPic.id}/${uuid()}.jpg`, jpeg(), { contentType: 'image/jpeg' })
  ok('outsider C cannot upload into the couple folder', !!cUp.error, describe(cUp))
  const cRm = await store(C.client).remove([p1])
  ok('outsider C cannot remove the picture', (cRm.data ?? []).length === 0 && await exists(p1), describe(cRm))
  const cRow = await C.client.from('bucket_items').select('image_path').eq('id', withPic.id)
  ok('outsider C cannot read the row (and its image_path)', (cRow.data ?? []).length === 0, describe(cRow))

  const anonDown = await store(anon).download(p1)
  const anonList = await store(anon).list(`${cid}/${withPic.id}`)
  const anonUp = await store(anon).upload(`${cid}/${withPic.id}/${uuid()}.jpg`, jpeg(), { contentType: 'image/jpeg' })
  ok('anon cannot download, list or upload', !!anonDown.error && (anonList.data ?? []).length === 0 && !!anonUp.error, `${describe(anonDown)} | ${describe(anonUp)}`)
  const publicUrl = store(anon).getPublicUrl(p1).data.publicUrl
  ok('the bucket is private (public URL does not serve)', (await fetch(publicUrl)).status >= 400)

  // ---------- 5. storage path rules ----------
  const aIntoC = await store(A.client).upload(`${cid2}/${uuid()}/${uuid()}.jpg`, jpeg(), { contentType: 'image/jpeg' })
  ok('A cannot upload into another couple\'s folder', !!aIntoC.error, describe(aIntoC))
  const cIntoOwn = await store(C.client).upload(`${cid2}/${uuid()}/${uuid()}.jpg`, jpeg(), { contentType: 'image/jpeg' })
  ok('C can upload into its own couple folder (control)', !cIntoOwn.error, describe(cIntoOwn))
  for (const [label, path] of [
    ['non-uuid item folder', `${cid}/not-a-uuid/${uuid()}.jpg`],
    ['a fourth segment', `${cid}/${withPic.id}/extra/${uuid()}.jpg`],
    ['no item folder', `${cid}/${uuid()}.jpg`],
    ['a non-image extension', `${cid}/${withPic.id}/${uuid()}.svg`],
    ['a non-uuid couple folder', `not-a-couple/${withPic.id}/${uuid()}.jpg`],
  ]) {
    const r = await store(A.client).upload(path, jpeg(), { contentType: 'image/jpeg' })
    ok(`upload refused: ${label}`, !!r.error, describe(r))
  }
  const wrongType = await store(A.client).upload(`${cid}/${withPic.id}/${uuid()}.jpg`, new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' })
  ok('upload refused: a non-allowed content type', !!wrongType.error, describe(wrongType))
  const huge = await store(A.client).upload(`${cid}/${withPic.id}/${uuid()}.jpg`, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  ok('upload refused: over 5 MB', !!huge.error, describe(huge))
  const bigSave = await throwsAsync(() => saveBucketItem(A.client, { coupleId: cid, userId: A.id, existing: null, input: base('Too big'), picture: { kind: 'set', blob: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }) } }))
  ok('saveBucketItem refuses an oversize picture before uploading', !!bigSave && /too big/i.test(bigSave.message))
  const overwrite = await store(A.client).upload(p1, jpeg(), { contentType: 'image/jpeg', upsert: true })
  const updateFile = await store(A.client).update(p1, jpeg(), { contentType: 'image/jpeg' })
  const moved = await store(A.client).move(p1, `${cid}/${withPic.id}/${uuid()}.jpg`)
  ok('a picture can\'t be overwritten or moved (no UPDATE policy)', !!overwrite.error && !!updateFile.error && !!moved.error && await exists(p1),
    `${describe(overwrite)} | ${describe(updateFile)} | ${describe(moved)}`)
  ok('folder still holds exactly the one picture', JSON.stringify(await filesUnder(`${cid}/${withPic.id}`).then((f) => f)) === JSON.stringify([p1]))

  for (const [label, path] of [
    ['another couple\'s folder', `${cid2}/${withPic.id}/${uuid()}.jpg`],
    ['another item\'s folder', `${cid}/${linked.id}/${uuid()}.jpg`],
    ['a ../ trick', `${cid}/${withPic.id}/../${linked.id}/x.jpg`],
    ['a nested name', `${cid}/${withPic.id}/a/b.jpg`],
  ]) {
    const r = await A.client.from('bucket_items').update({ image_path: path }).eq('id', withPic.id).select()
    ok(`DB refuses image_path in ${label}`, r.error?.code === '23514', describe(r))
  }
  ok('image_path unchanged after refused writes', (await rowOf(withPic.id))?.image_path === p1)

  // ---------- 6. replace, conflict, remove ----------
  const replaced = await saveBucketItem(A.client, {
    coupleId: cid, userId: A.id, existing: { id: withPic.id, image_path: p1 }, input: base('Sunset picnic'), picture: { kind: 'set', blob: jpeg() },
  })
  const p2 = replaced.image_path
  ok('replace points the row at a new file', !!p2 && p2 !== p1 && p2.startsWith(`${cid}/${withPic.id}/`))
  ok('replace removes the old file, no orphan left', JSON.stringify(await filesUnder(`${cid}/${withPic.id}`)) === JSON.stringify([p2]))
  ok('an update without a link key keeps the link through a picture change', replaced.reference_url === 'https://maps.app.goo.gl/picnic')

  const stale = await throwsAsync(() => saveBucketItem(B.client, {
    coupleId: cid, userId: B.id, existing: { id: withPic.id, image_path: p1 }, input: base('B edits with a stale view'), picture: { kind: 'set', blob: jpeg() },
  }))
  ok('a stale picture edit fails with the conflict error', stale instanceof BucketPictureConflictError, stale?.message)
  ok('the stale edit changed nothing and its upload is gone', (await rowOf(withPic.id))?.image_path === p2 && (await rowOf(withPic.id))?.title === 'Sunset picnic'
    && JSON.stringify(await filesUnder(`${cid}/${withPic.id}`)) === JSON.stringify([p2]))
  const staleRemove = await throwsAsync(() => saveBucketItem(B.client, {
    coupleId: cid, userId: B.id, existing: { id: withPic.id, image_path: p1 }, input: base('Sunset picnic'), picture: { kind: 'remove' },
  }))
  ok('a stale "remove picture" fails and keeps the current one', staleRemove instanceof BucketPictureConflictError && await exists(p2))

  const kept = await saveBucketItem(B.client, {
    coupleId: cid, userId: B.id, existing: { id: withPic.id, image_path: p2 }, input: base('Sunset picnic at the beach'),
  })
  ok('a text-only edit keeps the picture', kept.image_path === p2 && kept.title === 'Sunset picnic at the beach' && await exists(p2))

  const removed = await saveBucketItem(B.client, {
    coupleId: cid, userId: B.id, existing: { id: withPic.id, image_path: p2 }, input: base('Sunset picnic at the beach'), picture: { kind: 'remove' },
  })
  ok('partner removes the picture: row cleared', removed.image_path === null)
  ok('partner removes the picture: file gone', (await filesUnder(`${cid}/${withPic.id}`)).length === 0)
  const readded = await saveBucketItem(B.client, {
    coupleId: cid, userId: B.id, existing: { id: withPic.id, image_path: null }, input: base('Sunset picnic at the beach'), picture: { kind: 'set', blob: jpeg() },
  })
  ok('a picture can be added on edit', !!readded.image_path && await exists(readded.image_path))

  // A failed row write after the upload removes the upload again.
  const before = await filesUnder(cid)
  const forged = await throwsAsync(() => saveBucketItem(A.client, {
    coupleId: cid, userId: B.id /* not me: RLS refuses the insert */, existing: null, input: base('Forged author'), picture: { kind: 'set', blob: jpeg() },
  }))
  ok('a refused create throws', !!forged)
  ok('a refused create leaves no file behind', JSON.stringify(await filesUnder(cid)) === JSON.stringify(before))
  const tooLong = await throwsAsync(() => saveBucketItem(A.client, { coupleId: cid, userId: A.id, existing: null, input: base('x'.repeat(121)), picture: { kind: 'set', blob: jpeg() } }))
  ok('an invalid form is refused before anything uploads', !!tooLong && JSON.stringify(await filesUnder(cid)) === JSON.stringify(before))
  // The reply got lost after the file landed (dropped connection, stalled upload given up on)
  let landed = null
  const lostReply = await throwsAsync(() => saveBucketItem(A.client, {
    coupleId: cid, userId: A.id, existing: null, input: base('Lost reply'), picture: { kind: 'set', blob: jpeg() },
    upload: async (path, blob) => {
      const r = await store(A.client).upload(path, blob, { contentType: 'image/jpeg' })
      if (r.error) throw r.error
      landed = path
      throw new Error('network reply lost')
    },
  }))
  ok('an upload that errors after landing is removed again', !!lostReply && !!landed && !(await exists(landed))
    && JSON.stringify(await filesUnder(cid)) === JSON.stringify(before))

  // The page uploads with XMLHttpRequest (for progress) instead of supabase-js:
  // same endpoint, headers and multipart body, sent here with fetch.
  const xhrShape = async (who, path) => {
    const { data: { session } } = await who.client.auth.getSession()
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', jpeg())
    return fetch(`${URL_}/storage/v1/object/${BUCKET_PICTURES}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'x-upsert': 'false' },
      body,
    })
  }
  const xhrPath = bucketPicturePath(cid, readded.id)
  const xhrOk = await xhrShape(A, xhrPath)
  const { data: xhrMeta } = await store(admin).list(`${cid}/${readded.id}`, { search: xhrPath.split('/')[2] })
  ok('the page\'s direct upload request is accepted and stored as image/jpeg', xhrOk.status === 200 && xhrMeta?.[0]?.metadata?.mimetype === 'image/jpeg',
    `${xhrOk.status} ${JSON.stringify(xhrMeta?.[0]?.metadata ?? null)}`)
  const xhrDenied = await xhrShape(C, bucketPicturePath(cid, readded.id))
  ok('the same request from the outsider is refused', xhrDenied.status >= 400, String(xhrDenied.status))
  await store(A.client).remove([xhrPath])

  // ---------- 7. deleting an item removes its folder ----------
  const doomed = await saveBucketItem(A.client, { coupleId: cid, userId: A.id, existing: null, input: base('Pottery class'), picture: { kind: 'set', blob: jpeg() } })
  // A leftover from an interrupted edit, sitting next to the current picture
  const orphan = `${cid}/${doomed.id}/${uuid()}.jpg`
  const planted = await store(A.client).upload(orphan, jpeg(), { contentType: 'image/jpeg' })
  ok('setup: two files in the doomed item\'s folder', !planted.error && (await filesUnder(`${cid}/${doomed.id}`)).length === 2, describe(planted))
  await deleteBucketItem(C.client, doomed.id)
  ok('outsider delete is a no-op (row and files stay)', !!(await rowOf(doomed.id)) && (await filesUnder(`${cid}/${doomed.id}`)).length === 2)
  await deleteBucketItem(B.client, doomed.id)
  ok('delete removes the row', !(await rowOf(doomed.id)))
  ok('delete removes the picture and any leftover in its folder', (await filesUnder(`${cid}/${doomed.id}`)).length === 0)
  const linkOnly = await createBucketItem(A.client, cid, A.id, base('Link only', { reference_url: 'https://example.com/' }))
  const linkOnlyDelete = await throwsAsync(() => deleteBucketItem(A.client, linkOnly.id))
  ok('deleting an item without a picture works', linkOnlyDelete === null && !(await rowOf(linkOnly.id)))

  // ---------- 8. items without link or picture: unchanged ----------
  const plain = await createBucketItem(A.client, cid, A.id, { title: '  Naik gunung Prau  ', note: 'Lihat sunrise', category: 'petualangan', estimated_cost: 750000 })
  ok('plain create: trimmed, no link, no picture', plain.title === 'Naik gunung Prau' && plain.reference_url === null && plain.image_path === null
    && plain.source === 'manual' && plain.created_by === A.id && Number(plain.estimated_cost) === 750000)
  const plainEdit = await updateBucketItem(B.client, plain.id, { title: 'Naik gunung Prau bareng', note: 'Sunrise', category: 'traveling', estimated_cost: 800000 })
  ok('plain update: fields change, still no link or picture', plainEdit.title === 'Naik gunung Prau bareng' && plainEdit.category === 'traveling'
    && plainEdit.reference_url === null && plainEdit.image_path === null)
  const plainDone = await setBucketDone(B.client, plain.id, true)
  ok('plain item can be checked off', plainDone.is_done === true && !!plainDone.done_at && plainDone.image_path === null)
  const list = await listBucketItems(A.client, cid)
  ok('list returns every item with the new fields', list.some((i) => i.id === plain.id) && list.every((i) => 'reference_url' in i && 'image_path' in i))
  ok('progress and moment link unchanged', bucketProgress([{ is_done: true }, { is_done: false }]).percent === 50
    && momentPrefillHref({ id: plain.id, title: 'Kelas masak & pasta' }) === `/app/moments/baru?title=Kelas+masak+%26+pasta&bucket=${plain.id}`)
  const plainSave = await saveBucketItem(A.client, { coupleId: cid, userId: A.id, existing: null, input: base('Plain through save') })
  ok('saveBucketItem without a picture or link makes a plain item', plainSave.image_path === null && plainSave.reference_url === null)
  ok('plain items add no storage files', (await filesUnder(`${cid}/${plain.id}`)).length === 0 && (await filesUnder(`${cid}/${plainSave.id}`)).length === 0)

  // ---------- 9. a deleted couple's pictures are swept ----------
  const eItem = await saveBucketItem(E.client, { coupleId: cE.data.id, userId: E.id, existing: null, input: base('Solo idea'), picture: { kind: 'set', blob: jpeg() } })
  const eItem2 = await saveBucketItem(E.client, { coupleId: cE.data.id, userId: E.id, existing: null, input: base('Another'), picture: { kind: 'set', blob: jpeg() } })
  ok('setup: E has two pictures', (await filesUnder(cE.data.id)).length === 2 && !!eItem.image_path && !!eItem2.image_path)
  const left = await E.client.rpc('leave_couple')
  ok('E leaves as the last member: couple deleted', !left.error && left.data?.deleted === true, describe(left))
  ok('the rows went with the couple, the files are still there until swept', !(await rowOf(eItem.id)) && (await filesUnder(cE.data.id)).length === 2)
  const swept = await removeCoupleBucketPictures(admin, cE.data.id)
  ok('removeCoupleBucketPictures (used by couple/leave and account/delete) removes them', swept === 2 && (await filesUnder(cE.data.id)).length === 0, String(swept))
  ok('the sweep refuses a non-uuid couple id', !!(await throwsAsync(() => removeCoupleBucketPictures(admin, '../moments'))))
  ok('the sweep left other couples alone', (await filesUnder(cid)).length > 0 && (await filesUnder(cid2)).length === 1)
}

try { await main() } catch (e) { failures.push(`crash: ${e.stack ?? e.message}`) }
finally {
  // Rows go with their couples; files are removed here.
  const { data: leftovers } = await admin.from('couple_members').select('couple_id').in('profile_id', created)
  for (const m of leftovers ?? []) couples.add(m.couple_id)
  for (const id of couples) {
    await removeCoupleBucketPictures(admin, id).catch(() => undefined)
    await admin.from('couples').delete().eq('id', id)
  }
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('bucket reference verification passed')
process.exit(0)
