// Connection features (F16–F20) data-layer check against a LOCAL Supabase.
//   node scripts/verify/connection.mjs
// Mood check-in, bucket list, gratitude jar, activity rows, daily-answer
// archive visibility, plus milestone / archive unit cases. The app's own data
// helpers (src/lib/*.ts, runtime-import-free) are exercised directly.
// Prints "CONNECTION VERIFY PASSED" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { MOOD_KEYS, MOODS, saveCheckin, listCheckins, countMoods, dateRange, shiftDate } from '../../src/lib/mood.ts'
import {
  createBucketItem, updateBucketItem, setBucketDone, deleteBucketItem, listBucketItems,
  momentPrefillHref, bucketProgress, validateBucketInput, BUCKET_CATEGORIES,
} from '../../src/lib/bucket.ts'
import { sendNote, openNote, deleteNote, listNotes, splitNotes, pickRandom } from '../../src/lib/gratitude.ts'
import { computeStreak, buildDailyEntries, buildAiEntries, groupByMonth, matchesQuery } from '../../src/lib/daily-archive.ts'
import { milestoneStatus, milestonesFor } from '../../src/lib/milestones.ts'

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
const throwsAsync = async (fn) => { try { await fn(); return null } catch (e) { return e } }
const created = []
const couples = []
async function signUp(client, tag) {
  const { data, error } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (error) throw error
  created.push(data.user.id)
  return data.user.id
}
const jakartaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function mood({ a, b, c, aid, bid, cid, cid2 }) {
  const today = jakartaToday()
  const yesterday = shiftDate(today, -1)

  ok('mood keys match the 8 DB moods', MOOD_KEYS.length === 8 && MOOD_KEYS.every((k) => MOODS[k]?.emoji && MOODS[k]?.suggestion))
  // Every mood the UI offers is accepted; the same day keeps a single row.
  let first = null
  for (const m of MOOD_KEYS) {
    const e = await throwsAsync(async () => { const row = await saveCheckin(a, { coupleId: cid, userId: aid, mood: m, note: null, date: today }); first ??= row })
    if (e) failures.push(`mood ${m} accepted — ${e.message}`)
  }
  pass++
  const { count: rowsToday } = await admin.from('mood_checkins').select('*', { count: 'exact', head: true }).eq('profile_id', aid).eq('checkin_date', today)
  ok('upsert keeps one row per person per day', rowsToday === 1, `rows=${rowsToday}`)

  const { error: dupE } = await a.from('mood_checkins').insert({ couple_id: cid, profile_id: aid, mood: 'senang', checkin_date: today })
  ok('second plain insert for the same day conflicts', dupE?.code === '23505', dupE?.code ?? 'no error')

  const { count: actBefore } = await admin.from('activities').select('*', { count: 'exact', head: true }).eq('couple_id', cid).eq('kind', 'mood')
  const changed = await saveCheckin(a, { coupleId: cid, userId: aid, mood: 'capek', note: 'lembur-RAHASIA-MOOD', date: today })
  ok('upsert updates mood + note in place', changed.id === first.id && changed.mood === 'capek' && changed.note === 'lembur-RAHASIA-MOOD')
  const { count: actAfterChange } = await admin.from('activities').select('*', { count: 'exact', head: true }).eq('couple_id', cid).eq('kind', 'mood')
  await saveCheckin(a, { coupleId: cid, userId: aid, mood: 'capek', note: 'cuma ubah catatan', date: today })
  const { count: actAfterNote } = await admin.from('activities').select('*', { count: 'exact', head: true }).eq('couple_id', cid).eq('kind', 'mood')
  ok('mood change logs an activity, note-only edit does not', actAfterChange === actBefore + 1 && actAfterNote === actAfterChange, `${actBefore}→${actAfterChange}→${actAfterNote}`)
  await saveCheckin(a, { coupleId: cid, userId: aid, mood: 'capek', note: 'lembur-RAHASIA-MOOD', date: today })

  const { error: badMood } = await a.from('mood_checkins').upsert({ couple_id: cid, profile_id: aid, mood: 'bahagia', checkin_date: today }, { onConflict: 'profile_id,checkin_date' })
  ok('unknown mood rejected', !!badMood)
  const { error: longNote } = await a.from('mood_checkins').upsert({ couple_id: cid, profile_id: aid, mood: 'senang', note: 'x'.repeat(141), checkin_date: today }, { onConflict: 'profile_id,checkin_date' })
  ok('note over 140 chars rejected', !!longNote)
  ok('helper rejects long note before the DB', !!(await throwsAsync(() => saveCheckin(a, { coupleId: cid, userId: aid, mood: 'senang', note: 'x'.repeat(141), date: today }))))

  const { data: bDefault, error: bDefE } = await b.from('mood_checkins').insert({ couple_id: cid, profile_id: bid, mood: 'kangen' }).select().single()
  ok('default checkin_date is the Jakarta day', !bDefE && bDefault?.checkin_date === today, bDefE?.message ?? bDefault?.checkin_date)
  await saveCheckin(a, { coupleId: cid, userId: aid, mood: 'senang', note: null, date: yesterday })

  const { data: bSeesA } = await b.from('mood_checkins').select('mood, note').eq('profile_id', aid).eq('checkin_date', today)
  ok('partner reads my mood + note', bSeesA?.[0]?.mood === 'capek' && bSeesA?.[0]?.note === 'lembur-RAHASIA-MOOD')
  const list = await listCheckins(b, cid, shiftDate(today, -13))
  ok('listCheckins returns both partners, newest first', list.length === 3 && list[0].checkin_date === today && list[2].checkin_date === yesterday, `len=${list.length}`)
  const counts = countMoods(list)
  ok('countMoods tallies by mood', counts.length === 3 && counts.every((c) => c.count === 1))
  const range = dateRange(today, 14)
  ok('dateRange is 14 days ending today', range.length === 14 && range[13] === today && range[0] === shiftDate(today, -13))

  const { data: cSees } = await c.from('mood_checkins').select('id').eq('couple_id', cid)
  ok('other couple reads no moods', (cSees ?? []).length === 0)
  const { error: cIns } = await c.from('mood_checkins').insert({ couple_id: cid, profile_id: (await c.auth.getUser()).data.user.id, mood: 'senang' })
  ok('other couple cannot insert into this couple', !!cIns)

  const { error: asPartner } = await b.from('mood_checkins').insert({ couple_id: cid, profile_id: aid, mood: 'sedih', checkin_date: shiftDate(today, -2) })
  ok('cannot insert a mood as my partner', !!asPartner)
  const { data: bUpd } = await b.from('mood_checkins').update({ mood: 'kesal' }).eq('profile_id', aid).select()
  const { data: aRow } = await admin.from('mood_checkins').select('mood').eq('profile_id', aid).eq('checkin_date', today).single()
  ok('cannot update my partner\'s mood', (bUpd ?? []).length === 0 && aRow.mood === 'capek')
  const { error: delE } = await a.from('mood_checkins').delete().eq('profile_id', aid)
  const { count: aLeft } = await admin.from('mood_checkins').select('*', { count: 'exact', head: true }).eq('profile_id', aid)
  ok('mood rows cannot be deleted by users', !!delE || aLeft === 2, `left=${aLeft}`)
  void cid2
}

async function bucket({ a, b, c, aid, bid, cid, cid2, cUid }) {
  const itemA = await createBucketItem(a, cid, aid, { title: '  Naik gunung Prau  ', note: 'Lihat sunrise', category: 'petualangan', estimated_cost: 750000 })
  ok('create item (trimmed, manual, mine)', itemA.title === 'Naik gunung Prau' && itemA.source === 'manual' && itemA.created_by === aid && !itemA.is_done)
  const itemB = await createBucketItem(b, cid, bid, { title: 'Kelas masak pasta', note: null, category: 'belajar', estimated_cost: null })
  ok('partner creates item', itemB.created_by === bid)

  const { error: spoof } = await b.from('bucket_items').insert({ couple_id: cid, created_by: aid, title: 'Atas nama pasangan' })
  ok('created_by must be me', !!spoof)
  const { error: badCat } = await a.from('bucket_items').insert({ couple_id: cid, created_by: aid, title: 'X', category: 'olahraga' })
  ok('unknown category rejected', !!badCat)
  const { error: longTitle } = await a.from('bucket_items').insert({ couple_id: cid, created_by: aid, title: 'x'.repeat(121) })
  ok('title over 120 rejected', !!longTitle)
  const { error: negCost } = await a.from('bucket_items').insert({ couple_id: cid, created_by: aid, title: 'Minus', estimated_cost: -1 })
  ok('negative cost rejected', !!negCost)
  ok('client validation mirrors DB', validateBucketInput({ title: ' ', note: null, category: 'lainnya', estimated_cost: null }) !== null
    && validateBucketInput({ title: 'x'.repeat(121), note: null, category: 'lainnya', estimated_cost: null }) !== null
    && validateBucketInput({ title: 'ok', note: null, category: 'lainnya', estimated_cost: -5 }) !== null
    && validateBucketInput({ title: 'ok', note: null, category: 'lainnya', estimated_cost: 0 }) === null)
  ok('7 categories with emoji', BUCKET_CATEGORIES.length === 7 && BUCKET_CATEGORIES.every((cat) => cat.emoji))

  const edited = await updateBucketItem(b, itemA.id, { title: 'Naik gunung Prau bareng', note: 'Sunrise', category: 'traveling', estimated_cost: 800000 })
  ok('partner edits my item', edited.title === 'Naik gunung Prau bareng' && edited.category === 'traveling' && Number(edited.estimated_cost) === 800000)
  const done = await setBucketDone(b, itemA.id, true)
  ok('check done sets done_at', done.is_done && !!done.done_at)
  const undone = await setBucketDone(a, itemA.id, false)
  ok('uncheck clears done_at', !undone.is_done && undone.done_at === null)
  await setBucketDone(a, itemA.id, true)

  const { data: myMoment } = await a.from('moments').insert({ couple_id: cid, created_by: aid, title: 'Prau', moment_date: jakartaToday() }).select().single()
  const { data: theirMoment } = await c.from('moments').insert({ couple_id: cid2, created_by: cUid, title: 'Punya orang lain', moment_date: jakartaToday() }).select().single()
  const { error: linkE } = await b.from('bucket_items').update({ moment_id: myMoment.id }).eq('id', itemA.id)
  ok('link own couple\'s moment', !linkE, linkE?.message)
  const { error: foreignE } = await a.from('bucket_items').update({ moment_id: theirMoment.id }).eq('id', itemB.id)
  ok('linking another couple\'s moment refused (update)', !!foreignE)
  const { error: foreignIns } = await a.from('bucket_items').insert({ couple_id: cid, created_by: aid, title: 'Curang', moment_id: theirMoment.id })
  ok('linking another couple\'s moment refused (insert)', !!foreignIns)

  const { data: cSees } = await c.from('bucket_items').select('id').eq('couple_id', cid)
  ok('other couple reads no items', (cSees ?? []).length === 0)
  const { data: cUpd } = await c.from('bucket_items').update({ title: 'Dibajak' }).eq('id', itemB.id).select()
  const { data: cDel } = await c.from('bucket_items').delete().eq('id', itemB.id).select()
  const { data: stillB } = await admin.from('bucket_items').select('title').eq('id', itemB.id).maybeSingle()
  ok('other couple cannot edit or delete', (cUpd ?? []).length === 0 && (cDel ?? []).length === 0 && stillB?.title === 'Kelas masak pasta')
  const { error: cIns } = await c.from('bucket_items').insert({ couple_id: cid, created_by: cUid, title: 'Nyelip' })
  ok('other couple cannot insert', !!cIns)

  const list = await listBucketItems(a, cid)
  const prog = bucketProgress(list)
  ok('list + progress', list.length === 2 && prog.done === 1 && prog.total === 2 && prog.percent === 50, JSON.stringify(prog))
  const href = momentPrefillHref({ id: itemB.id, title: 'Kelas masak & pasta' })
  ok('moment prefill link', href === `/app/moments/baru?title=Kelas+masak+%26+pasta&bucket=${itemB.id}`, href)
  ok('prefill title capped at 100', new URLSearchParams(momentPrefillHref({ id: 'x', title: 'y'.repeat(120) }).split('?')[1]).get('title').length === 100)

  await deleteBucketItem(a, itemB.id)
  const { count: bLeft } = await admin.from('bucket_items').select('*', { count: 'exact', head: true }).eq('id', itemB.id)
  ok('partner deletes an item they did not create', bLeft === 0)
  return { itemA }
}

async function gratitude({ a, b, c, d, aid, bid, cid, cid2, cUid }) {
  const n1 = await sendNote(a, { coupleId: cid, fromId: aid, toId: bid, body: 'Makasih udah jemput aku RAHASIA-N1' })
  const n2 = await sendNote(a, { coupleId: cid, fromId: aid, toId: bid, body: 'Kamu sabar banget RAHASIA-N2' })
  const n3 = await sendNote(b, { coupleId: cid, fromId: bid, toId: aid, body: 'Masakanmu enak RAHASIA-N3' })
  ok('notes to my partner', n1.to_id === bid && !n1.opened_at && n3.to_id === aid)

  ok('note to myself refused', !!(await throwsAsync(() => sendNote(a, { coupleId: cid, fromId: aid, toId: aid, body: 'diri sendiri' }))))
  ok('note to a stranger refused', !!(await throwsAsync(() => sendNote(a, { coupleId: cid, fromId: aid, toId: cUid, body: 'orang lain' }))))
  ok('note into another couple refused', !!(await throwsAsync(() => sendNote(a, { coupleId: cid2, fromId: aid, toId: cUid, body: 'orang lain' }))))
  const { error: spoofFrom } = await b.from('gratitude_notes').insert({ couple_id: cid, from_id: aid, to_id: bid, body: 'palsu' })
  ok('from_id must be me', !!spoofFrom)
  const { error: tooLong } = await a.from('gratitude_notes').insert({ couple_id: cid, from_id: aid, to_id: bid, body: 'x'.repeat(281) })
  ok('body over 280 rejected', !!tooLong)

  const { data: cSees } = await c.from('gratitude_notes').select('id').eq('couple_id', cid)
  const { data: dSees } = await d.from('gratitude_notes').select('id')
  ok('other couple reads no notes', (cSees ?? []).length === 0 && (dSees ?? []).length === 0)

  const opened = await openNote(b, n1.id)
  ok('recipient opens a note', !!opened?.opened_at)
  ok('opening twice returns null', (await openNote(b, n1.id)) === null)
  const bySender = await openNote(a, n2.id)
  const { data: n2Row } = await admin.from('gratitude_notes').select('opened_at').eq('id', n2.id).single()
  ok('sender cannot set opened_at', bySender === null && n2Row.opened_at === null)
  const { error: bodyE } = await b.from('gratitude_notes').update({ body: 'diubah' }).eq('id', n1.id)
  const { data: n1Row } = await admin.from('gratitude_notes').select('body').eq('id', n1.id).single()
  ok('recipient cannot change body (column grant)', !!bodyE && n1Row.body.includes('RAHASIA-N1'), bodyE?.code)
  const { error: toE } = await b.from('gratitude_notes').update({ to_id: aid }).eq('id', n1.id)
  ok('recipient cannot readdress a note', !!toE)

  ok('sender cannot delete an opened note', (await deleteNote(a, n1.id)) === false)
  ok('recipient cannot delete', (await deleteNote(b, n2.id)) === false)
  const { count: stillThere } = await admin.from('gratitude_notes').select('*', { count: 'exact', head: true }).in('id', [n1.id, n2.id])
  ok('both notes still exist', stillThere === 2)

  const n4 = await sendNote(a, { coupleId: cid, fromId: aid, toId: bid, body: 'Hapus aku RAHASIA-N4' })
  ok('sender deletes own unopened note', (await deleteNote(a, n4.id)) === true)

  const bJar = splitNotes(await listNotes(b, cid), bid)
  ok('recipient jar: 1 waiting, 1 opened, 1 sent', bJar.waiting.length === 1 && bJar.waiting[0].id === n2.id && bJar.opened.length === 1 && bJar.sent.length === 1)
  const aJar = splitNotes(await listNotes(a, cid), aid)
  ok('sender jar: 2 sent, 1 opened by partner, 1 waiting for me', aJar.sent.length === 2 && aJar.sentOpened === 1 && aJar.waiting.length === 1)
  ok('pickRandom', pickRandom([]) === null && pickRandom(['x', 'y'], () => 0.99) === 'y' && pickRandom(['x', 'y'], () => 0) === 'x')
}

async function activities({ a, b, c, aid, bid, cid }) {
  const { error: letterE } = await a.from('letters').insert({
    couple_id: cid, sender_id: aid, receiver_id: bid, content: 'Isi surat RAHASIA-LETTER',
    unlock_date: new Date(Date.now() + 86400000).toISOString(),
  })
  ok('letter insert (for activity check)', !letterE, letterE?.message)

  const { data: rows } = await b.from('activities').select('kind, summary, actor_id, url').eq('couple_id', cid)
  const kinds = new Set((rows ?? []).map((r) => r.kind))
  for (const k of ['mood', 'bucket_add', 'bucket_done', 'gratitude', 'letter']) ok(`activity row for ${k}`, kinds.has(k))
  const done = (rows ?? []).find((r) => r.kind === 'bucket_done')
  ok('bucket_done actor is whoever checked it', done?.actor_id === bid || done?.actor_id === aid)
  const leaks = (rows ?? []).filter((r) => /RAHASIA/.test(r.summary))
  ok('no note / letter / mood-note text in activity summaries', leaks.length === 0, leaks.map((r) => r.kind).join(','))
  const grat = (rows ?? []).filter((r) => r.kind === 'gratitude')
  ok('gratitude summary is generic', grat.length >= 3 && grat.every((r) => r.summary === 'left a note of thanks in the Toples' && r.url === '/app/toples'))
  const { data: cRows } = await c.from('activities').select('id').eq('couple_id', cid)
  ok('other couple reads no activities', (cRows ?? []).length === 0)
}

async function archive({ a, b, c, aid, bid, cid }) {
  const today = jakartaToday()
  const d = (n) => shiftDate(today, -n)
  const answers = [
    [a, aid, 1], [a, aid, 2], [a, aid, 4], [a, aid, 5],
    [b, bid, 1], [b, bid, 2], [b, bid, 3], [b, bid, 4],
  ]
  for (const [client, pid, n] of answers) {
    const { error } = await client.from('daily_responses').insert({ couple_id: cid, profile_id: pid, question_index: n, answer: `jawaban ${pid === aid ? 'A' : 'B'} ${n}`, answered_date: d(n) })
    if (error) failures.push(`daily insert ${n}: ${error.message}`)
  }
  const { data: aRows } = await a.from('daily_responses').select('answered_date, profile_id, question_index, answer').eq('couple_id', cid)
  const partnerDates = (aRows ?? []).filter((r) => r.profile_id === bid).map((r) => r.answered_date).sort()
  ok('partner answers visible only on dates I answered', partnerDates.join() === [d(4), d(2), d(1)].join(), partnerDates.join())
  const { data: cRows } = await c.from('daily_responses').select('id').eq('couple_id', cid)
  ok('other couple sees no answers', (cRows ?? []).length === 0)

  const Q = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5']
  const entries = buildDailyEntries(aRows ?? [], aid, (i) => Q[i])
  ok('archive has one entry per date I answered, newest first', entries.map((e) => e.date).join() === [d(1), d(2), d(4), d(5)].join())
  ok('archive pairs answers + question text', entries[0].question === 'Q1' && entries[0].mine === 'jawaban A 1' && entries[0].partner === 'jawaban B 1')
  ok('partner missing → null', entries[3].partner === null)
  ok('streak counts both-answered days back from today', computeStreak(aRows ?? [], today) === 2, String(computeStreak(aRows ?? [], today)))

  await admin.from('ai_daily_questions').insert([
    { couple_id: cid, question_date: d(1), question: 'Pertanyaan AI kemarin?', generated_by: aid },
    { couple_id: cid, question_date: d(2), question: null, generated_by: aid },
  ])
  const { data: aiRows } = await a.from('ai_daily_questions').select('question_date, question').eq('couple_id', cid)
  const ai = buildAiEntries(aiRows ?? [], today)
  ok('AI questions listed as prompts (unfinished claims skipped)', ai.length === 1 && ai[0].question === 'Pertanyaan AI kemarin?')
  const { data: cAi } = await c.from('ai_daily_questions').select('id').eq('couple_id', cid)
  ok('other couple sees no AI questions', (cAi ?? []).length === 0)
  const months = groupByMonth([...entries, ...ai])
  ok('grouped by month, daily before AI on the same date', months.flatMap((m) => m.entries).length === 5 && months[0].entries[0].type === 'daily')
  ok('search matches question and answers', matchesQuery(entries[0], 'JAWABAN b') && matchesQuery(ai[0], 'kemarin') && !matchesQuery(entries[0], 'zzz'))
}

function streakUnits() {
  const t = '2026-10-27'
  const r = (date, p) => ({ answered_date: date, profile_id: p })
  ok('streak: empty → 0', computeStreak([], t) === 0)
  ok('streak: today complete counts', computeStreak([r(t, 'a'), r(t, 'b'), r('2026-10-26', 'a'), r('2026-10-26', 'b')], t) === 2)
  ok('streak: today incomplete is skipped', computeStreak([r(t, 'a'), r('2026-10-26', 'a'), r('2026-10-26', 'b')], t) === 1)
  ok('streak: gap breaks', computeStreak([r('2026-10-26', 'a'), r('2026-10-26', 'b'), r('2026-10-24', 'a'), r('2026-10-24', 'b')], t) === 1)
  ok('streak: across month boundary', computeStreak([r('2026-11-01', 'a'), r('2026-11-01', 'b'), r('2026-10-31', 'a'), r('2026-10-31', 'b')], '2026-11-01') === 2)
}

function milestoneUnits() {
  const s1 = milestoneStatus('2026-01-01', '2026-01-01')
  ok('milestone: day 0 → 7 hari in 7 days', s1.next?.key === 'd7' && s1.next.daysLeft === 7 && s1.passed.length === 0)
  const s2 = milestoneStatus('2026-01-01', '2026-01-08')
  ok('milestone: today is a milestone → daysLeft 0', s2.next?.key === 'd7' && s2.next.daysLeft === 0)
  const s3 = milestoneStatus('2026-01-01', '2026-01-09')
  ok('milestone: after it → passed, next 30 hari', s3.passed.map((m) => m.key).join() === 'd7' && s3.next?.key === 'd30' && s3.next.date === '2026-01-31')
  const d100 = milestonesFor('2026-01-01').find((m) => m.key === 'd100')
  ok('milestone: 100 hari date', d100?.date === '2026-04-11')
  const s4 = milestoneStatus('2025-10-27', '2026-10-27')
  ok('milestone: first anniversary today', s4.next?.key === 'y1' && s4.next.daysLeft === 0 && s4.next.caption === 'First anniversary')
  // Same rule as the calendar and reminders (src/lib/reminders.ts): 29 Feb → 1 Mar in common years.
  const leap = milestonesFor('2024-02-29').filter((m) => m.kind === 'years').map((m) => m.date)
  ok('milestone: 29 Feb start → 1 Mar in common years, 29 Feb in leap years', leap[0] === '2025-03-01' && leap[3] === '2028-02-29', leap.slice(0, 4).join(','))
  const old = milestoneStatus('2010-01-01', '2026-10-27')
  ok('milestone: long relationship still has a next one', !!old.next && old.next.date >= '2026-10-27' && old.passed.length > 20)
  const all = milestonesFor('2026-01-01')
  ok('milestone: sorted by date', all.every((m, i) => i === 0 || all[i - 1].date <= m.date))
  const future = milestoneStatus('2026-12-01', '2026-10-27')
  ok('milestone: future start → nothing passed, next after start', future.passed.length === 0 && future.next?.key === 'd7' && future.next.daysLeft === 42)
}

async function main() {
  const a = mk(), b = mk(), c = mk(), d = mk()
  const aid = await signUp(a, 'cna'), bid = await signUp(b, 'cnb')
  const cUid = await signUp(c, 'cnc')
  await signUp(d, 'cnd')
  const { data: couple, error: cE } = await a.rpc('create_couple')
  if (cE) throw cE
  const { error: jE } = await b.rpc('join_couple', { p_code: couple.invite_code })
  if (jE) throw jE
  const { data: couple2 } = await c.rpc('create_couple')
  await d.rpc('join_couple', { p_code: couple2.invite_code })
  couples.push(couple.id, couple2.id)
  const ctx = { a, b, c, d, aid, bid, cUid, cid: couple.id, cid2: couple2.id }

  await mood(ctx)
  await bucket(ctx)
  await gratitude(ctx)
  await activities(ctx)
  await archive(ctx)
  streakUnits()
  milestoneUnits()
}

try { await main() } catch (e) { failures.push(`crash: ${e.message}`) }
finally {
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('CONNECTION VERIFY PASSED')
