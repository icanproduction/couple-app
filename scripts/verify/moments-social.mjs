// Moments social layer (F14 reactions + comments, F15 favourites, bucket-list
// link, activity triggers) checked against a LOCAL Supabase.
//   node scripts/verify/moments-social.mjs
// Prints "MOMENTS-SOCIAL VERIFY PASSED" only when every check passes.
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
const couples = []
async function signUp(client, tag) {
  const { data, error } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (error || !data?.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  return data.user.id
}
async function makeCouple(x, y) {
  const { data: couple, error } = await x.rpc('create_couple')
  if (error) throw new Error(`create_couple: ${error.message}`)
  const { error: jE } = await y.rpc('join_couple', { p_code: couple.invite_code })
  if (jE) throw new Error(`join_couple: ${jE.message}`)
  couples.push(couple.id)
  return couple.id
}
const activityCount = async (coupleId, kind, refId) => {
  const { count } = await admin.from('activities').select('*', { count: 'exact', head: true })
    .eq('couple_id', coupleId).eq('kind', kind).eq('ref_id', refId)
  return count ?? 0
}

async function main() {
  const a = mk(), b = mk(), c = mk(), d = mk()
  const aid = await signUp(a, 'msa'), bid = await signUp(b, 'msb')
  const cidUser = await signUp(c, 'msc'); await signUp(d, 'msd')
  const cid = await makeCouple(a, b)
  const otherCid = await makeCouple(c, d)

  // ── Moment + its activity row ─────────────────────────────
  const { data: moment, error: mE } = await a.from('moments')
    .insert({ couple_id: cid, created_by: aid, title: 'Piknik di Kebun Raya', moment_date: '2026-09-20' })
    .select().single()
  ok('create moment', !mE && moment?.id, mE?.message)
  const mid = moment.id
  ok('activity row for new moment', (await activityCount(cid, 'moment', mid)) === 1)
  const { data: bActs } = await b.from('activities').select('kind, actor_id, summary, url').eq('ref_id', mid).eq('kind', 'moment')
  ok('partner reads moment activity', bActs?.length === 1 && bActs[0].actor_id === aid && bActs[0].url === `/app/moments/${mid}`, JSON.stringify(bActs))
  ok('activity summary has the title', /Piknik di Kebun Raya/.test(bActs?.[0]?.summary ?? ''))

  const { data: otherMoment } = await c.from('moments')
    .insert({ couple_id: otherCid, created_by: cidUser, title: 'Moment pasangan lain', moment_date: '2026-09-21' })
    .select().single()
  ok('other couple creates its own moment', !!otherMoment?.id)

  // ── Reactions ─────────────────────────────────────────────
  const { error: r1 } = await a.from('moment_reactions').insert({ moment_id: mid, couple_id: cid, profile_id: aid, emoji: '❤️' })
  ok('insert own reaction', !r1, r1?.message)
  const { data: ownR } = await a.from('moment_reactions').select('id').eq('moment_id', mid).eq('profile_id', aid).single()
  ok('reaction row has its own uuid id (surrogate key)', /^[0-9a-f-]{36}$/i.test(ownR?.id ?? ''), JSON.stringify(ownR))
  ok('activity row for reaction', (await activityCount(cid, 'reaction', mid)) === 1)

  const { error: r2 } = await a.from('moment_reactions')
    .upsert({ moment_id: mid, couple_id: cid, profile_id: aid, emoji: '😂' }, { onConflict: 'moment_id,profile_id' })
  ok('change own reaction via upsert', !r2, r2?.message)
  const { data: aRows } = await a.from('moment_reactions').select('emoji').eq('moment_id', mid).eq('profile_id', aid)
  ok('still one reaction per person, changed emoji', aRows?.length === 1 && aRows[0].emoji === '😂', JSON.stringify(aRows))
  ok('changing a reaction adds no activity', (await activityCount(cid, 'reaction', mid)) === 1)

  const { error: r3 } = await a.from('moment_reactions').update({ emoji: '🔥' }).eq('moment_id', mid).eq('profile_id', aid)
  ok('update own reaction', !r3, r3?.message)

  const { error: dupE } = await a.from('moment_reactions').insert({ moment_id: mid, couple_id: cid, profile_id: aid, emoji: '👏' })
  ok('second reaction row for same person refused', !!dupE)

  const { error: rb } = await b.from('moment_reactions').insert({ moment_id: mid, couple_id: cid, profile_id: bid, emoji: '😍' })
  ok('partner reacts', !rb, rb?.message)
  const { data: bothR } = await b.from('moment_reactions').select('profile_id, emoji').eq('moment_id', mid)
  ok('partner sees both reactions', bothR?.length === 2, `n=${bothR?.length}`)

  const { error: asOther } = await a.from('moment_reactions').upsert({ moment_id: mid, couple_id: cid, profile_id: bid, emoji: '🥹' }, { onConflict: 'moment_id,profile_id' })
  ok('reacting as partner profile refused', !!asOther)
  const { error: asOtherIns } = await c.from('moment_reactions').insert({ moment_id: otherMoment.id, couple_id: otherCid, profile_id: aid, emoji: '🥹' })
  ok('reacting as another profile (other couple) refused', !!asOtherIns)
  await a.from('moment_reactions').update({ emoji: '👏' }).eq('moment_id', mid).eq('profile_id', bid)
  await a.from('moment_reactions').delete().eq('moment_id', mid).eq('profile_id', bid)
  const { data: bStill } = await admin.from('moment_reactions').select('emoji').eq('moment_id', mid).eq('profile_id', bid).maybeSingle()
  ok("can't change or delete partner's reaction", bStill?.emoji === '😍', JSON.stringify(bStill))

  const { error: badEmoji } = await b.from('moment_reactions').update({ emoji: '💩' }).eq('moment_id', mid).eq('profile_id', bid)
  ok('emoji outside the list refused (update)', !!badEmoji)
  const { error: badEmoji2 } = await c.from('moment_reactions').insert({ moment_id: otherMoment.id, couple_id: otherCid, profile_id: cidUser, emoji: '👍' })
  ok('emoji outside the list refused (insert)', !!badEmoji2)

  const { error: delOwn } = await a.from('moment_reactions').delete().eq('moment_id', mid).eq('profile_id', aid)
  ok('delete own reaction', !delOwn, delOwn?.message)
  const { count: afterDel } = await admin.from('moment_reactions').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  ok('only partner reaction left', afterDel === 1, `n=${afterDel}`)

  // ── Comments ──────────────────────────────────────────────
  const { data: ca, error: caE } = await a.from('moment_comments')
    .insert({ moment_id: mid, couple_id: cid, profile_id: aid, body: 'Seru banget hari ini!' }).select().single()
  ok('insert own comment', !caE && ca?.id, caE?.message)
  ok('activity row for comment', (await activityCount(cid, 'comment', mid)) === 1)
  const { data: commentAct } = await admin.from('activities').select('summary').eq('kind', 'comment').eq('ref_id', mid).single()
  ok('comment activity hides the comment text', !/Seru banget/.test(commentAct?.summary ?? ''), commentAct?.summary)

  const { data: cb, error: cbE } = await b.from('moment_comments')
    .insert({ moment_id: mid, couple_id: cid, profile_id: bid, body: 'Kapan-kapan ke sana lagi ya' }).select().single()
  ok('partner comments', !cbE && cb?.id, cbE?.message)
  const { data: thread } = await a.from('moment_comments').select('id').eq('moment_id', mid)
  ok('both see the thread', thread?.length === 2, `n=${thread?.length}`)

  const { error: longE } = await a.from('moment_comments').insert({ moment_id: mid, couple_id: cid, profile_id: aid, body: 'x'.repeat(501) })
  ok('comment over 500 chars refused', !!longE)
  const { error: blankE } = await a.from('moment_comments').insert({ moment_id: mid, couple_id: cid, profile_id: aid, body: '    ' })
  ok('blank comment refused', !!blankE)
  const { data: max, error: maxE } = await a.from('moment_comments').insert({ moment_id: mid, couple_id: cid, profile_id: aid, body: 'y'.repeat(500) }).select().single()
  ok('comment of exactly 500 chars accepted', !maxE && max?.id, maxE?.message)
  const { error: spoofE } = await a.from('moment_comments').insert({ moment_id: mid, couple_id: cid, profile_id: bid, body: 'pura-pura jadi pasangan' })
  ok('commenting as partner profile refused', !!spoofE)
  const { error: editE } = await a.from('moment_comments').update({ body: 'diubah' }).eq('id', ca.id)
  ok('comments cannot be edited', !!editE)

  await a.from('moment_comments').delete().eq('id', cb.id)
  const { data: cbStill } = await admin.from('moment_comments').select('id').eq('id', cb.id).maybeSingle()
  ok("can't delete partner's comment", !!cbStill)
  const { error: delC } = await a.from('moment_comments').delete().eq('id', ca.id)
  const { data: caGone } = await admin.from('moment_comments').select('id').eq('id', ca.id).maybeSingle()
  ok('delete own comment', !delC && !caGone, delC?.message)

  // ── Another couple: no read, no write ─────────────────────
  const { data: cR } = await c.from('moment_reactions').select('emoji').eq('moment_id', mid)
  ok("other couple can't read reactions", (cR ?? []).length === 0)
  const { data: cC } = await c.from('moment_comments').select('id').eq('moment_id', mid)
  ok("other couple can't read comments", (cC ?? []).length === 0)
  const { data: cA } = await c.from('activities').select('id').eq('couple_id', cid)
  ok("other couple can't read activities", (cA ?? []).length === 0)
  const { error: cr1 } = await c.from('moment_reactions').insert({ moment_id: mid, couple_id: cid, profile_id: cidUser, emoji: '❤️' })
  ok("other couple can't react into this couple", !!cr1)
  const { error: cr2 } = await c.from('moment_reactions').insert({ moment_id: mid, couple_id: otherCid, profile_id: cidUser, emoji: '❤️' })
  ok("other couple can't react to this moment via own couple_id (moment_in_couple)", !!cr2)
  const { error: cc1 } = await c.from('moment_comments').insert({ moment_id: mid, couple_id: cid, profile_id: cidUser, body: 'halo' })
  ok("other couple can't comment into this couple", !!cc1)
  const { error: cc2 } = await c.from('moment_comments').insert({ moment_id: mid, couple_id: otherCid, profile_id: cidUser, body: 'halo' })
  ok("other couple can't comment on this moment via own couple_id (moment_in_couple)", !!cc2)
  await c.from('moment_comments').delete().eq('id', cb.id)
  await c.from('moment_reactions').delete().eq('moment_id', mid)
  const { count: survivors } = await admin.from('moment_comments').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  const { count: rSurvivors } = await admin.from('moment_reactions').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  ok("other couple can't delete this couple's comments/reactions", survivors === 2 && rSurvivors === 1, `c=${survivors} r=${rSurvivors}`)

  // ── Favourite (shared by the couple) ──────────────────────
  ok('moments start unfavourited', moment.is_favorite === false)
  const { error: fa } = await a.from('moments').update({ is_favorite: true }).eq('id', mid)
  const { data: fb } = await b.from('moments').select('is_favorite').eq('id', mid).single()
  ok('creator favourites, partner sees it', !fa && fb?.is_favorite === true, fa?.message)
  const { error: fb2 } = await b.from('moments').update({ is_favorite: false }).eq('id', mid)
  const { data: fa2 } = await a.from('moments').select('is_favorite').eq('id', mid).single()
  ok('partner unfavourites, creator sees it', !fb2 && fa2?.is_favorite === false, fb2?.message)
  await c.from('moments').update({ is_favorite: true }).eq('id', mid)
  const { data: fAfter } = await admin.from('moments').select('is_favorite').eq('id', mid).single()
  ok("other couple can't favourite this moment", fAfter?.is_favorite === false)
  const { data: favList } = await a.from('moments').select('id').eq('couple_id', cid).eq('is_favorite', true)
  ok('favourite filter query works', (favList ?? []).length === 0)

  // ── Bucket list ↔ moment link ─────────────────────────────
  const { data: item, error: iE } = await a.from('bucket_items')
    .insert({ couple_id: cid, created_by: aid, title: 'Piknik di Kebun Raya' }).select().single()
  ok('create bucket item', !iE && item?.id, iE?.message)
  ok('activity row for bucket item', (await activityCount(cid, 'bucket_add', item.id)) === 1)
  const { error: crossE } = await a.from('bucket_items').update({ moment_id: otherMoment.id }).eq('id', item.id)
  ok("linking a bucket item to another couple's moment refused", !!crossE)
  const { error: crossIns } = await a.from('bucket_items')
    .insert({ couple_id: cid, created_by: aid, title: 'Curang', moment_id: otherMoment.id })
  ok("creating a bucket item linked to another couple's moment refused", !!crossIns)
  const { error: linkE } = await b.from('bucket_items')
    .update({ moment_id: mid, is_done: true, done_at: new Date().toISOString() }).eq('id', item.id)
  ok('partner marks bucket item done with this moment', !linkE, linkE?.message)
  const { data: linked } = await a.from('bucket_items').select('moment_id, is_done, done_at').eq('id', item.id).single()
  ok('bucket item now points at the moment', linked?.moment_id === mid && linked?.is_done === true && !!linked?.done_at, JSON.stringify(linked))
  const { data: doneAct } = await admin.from('activities').select('actor_id').eq('kind', 'bucket_done').eq('ref_id', item.id)
  ok('activity row for bucket done, by the partner', doneAct?.length === 1 && doneAct[0].actor_id === bid, JSON.stringify(doneAct))
  await c.from('bucket_items').update({ is_done: false, moment_id: null }).eq('id', item.id)
  const { data: untouched } = await admin.from('bucket_items').select('moment_id, is_done').eq('id', item.id).single()
  ok("other couple can't touch this couple's bucket item", untouched?.moment_id === mid && untouched?.is_done === true)

  // ── On-this-day lookup (same month-day, earlier years) ────
  const { data: past } = await a.from('moments')
    .insert({ couple_id: cid, created_by: aid, title: 'Setahun lalu', moment_date: '2025-10-27' }).select().single()
  const { data: otd } = await b.from('moments').select('id').eq('couple_id', cid).in('moment_date', ['2025-10-27', '2024-10-27'])
  ok('on-this-day date list query finds last year', otd?.length === 1 && otd[0].id === past?.id)

  // ── Deleting the moment cleans up the thread; bucket link is cleared ──
  const { error: delM } = await a.from('moments').delete().eq('id', mid)
  ok('delete moment', !delM, delM?.message)
  const { count: leftC } = await admin.from('moment_comments').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  const { count: leftR } = await admin.from('moment_reactions').select('*', { count: 'exact', head: true }).eq('moment_id', mid)
  ok('comments + reactions cascade-deleted', leftC === 0 && leftR === 0, `c=${leftC} r=${leftR}`)
  const { data: unlinked } = await admin.from('bucket_items').select('moment_id, is_done').eq('id', item.id).single()
  ok('bucket item keeps done state, link set null', unlinked?.moment_id === null && unlinked?.is_done === true)
}

try { await main() } catch (e) { failures.push(`crash: ${e.message}`) }
finally {
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('MOMENTS-SOCIAL VERIFY PASSED')
