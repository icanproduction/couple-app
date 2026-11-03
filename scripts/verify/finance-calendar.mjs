// Finance (F06, F07, F10) + calendar (F08, F09) check against a LOCAL Supabase
// and the local dev server (http://localhost:3030 by default).
//   node scripts/verify/finance-calendar.mjs
// Prints "FINANCE-CALENDAR VERIFY PASSED" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const APP = process.env.VERIFY_APP_URL ?? 'http://localhost:3030'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error(`Refusing to run: app URL is not local (${APP})`)
  process.exit(1)
}
const CRON_SECRET = env.CRON_SECRET

// Pure modules (no "@/" imports) run directly; Node 24 strips the TS types.
const R = await import(pathToFileURL(join(root, 'src/lib/reminders.ts')).href)
const F = await import(pathToFileURL(join(root, 'src/lib/finance.ts')).href)

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
const created = []
const couples = []
async function signUp(client, tag) {
  const { data } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (data?.user) created.push(data.user.id)
  return data.user.id
}
const balanceOf = async (goalId) => Number((await admin.from('savings_goals').select('current_amount').eq('id', goalId).single()).data?.current_amount)

// ---------------------------------------------------------------- unit: reminders
function reminderUnits() {
  const ev = (event_date, is_recurring, remind_days_before, is_completed = false) => ({ event_date, is_recurring, remind_days_before, is_completed })
  // one-off
  eq('one-off H-0 due on the day', R.reminderDueOn(ev('2026-10-30', false, 0), '2026-10-30'), '2026-10-30')
  eq('one-off H-1 due the day before', R.reminderDueOn(ev('2026-10-30', false, 1), '2026-10-29'), '2026-10-30')
  eq('one-off H-1 not due two days before', R.reminderDueOn(ev('2026-10-30', false, 1), '2026-10-28'), null)
  eq('one-off H-3 due 3 days before', R.reminderDueOn(ev('2026-10-30', false, 3), '2026-10-27'), '2026-10-30')
  eq('one-off H-7 due a week before (month wrap)', R.reminderDueOn(ev('2026-11-03', false, 7), '2026-10-27'), '2026-11-03')
  eq('one-off past: nothing', R.reminderDueOn(ev('2026-10-20', false, 0), '2026-10-27'), null)
  eq('no reminder set: nothing', R.reminderDueOn(ev('2026-10-27', false, null), '2026-10-27'), null)
  eq('completed one-off date plan skipped', R.reminderDueOn(ev('2026-10-28', false, 1, true), '2026-10-27'), null)
  // recurring
  eq('recurring H-7 this year', R.reminderDueOn(ev('2000-05-10', true, 7), '2026-05-03'), '2026-05-10')
  eq('recurring H-0 this year', R.reminderDueOn(ev('2000-05-10', true, 0), '2026-05-10'), '2026-05-10')
  eq('recurring day after: next year is not due', R.reminderDueOn(ev('2000-05-10', true, 7), '2026-05-11'), null)
  eq('recurring H-7 across new year', R.reminderDueOn(ev('1990-01-03', true, 7), '2026-12-27'), '2027-01-03')
  eq('recurring, first date still ahead: not due a year early', R.reminderDueOn(ev('2027-06-01', true, 0), '2026-06-01'), null)
  eq('recurring, first date ahead: due before it', R.reminderDueOn(ev('2027-06-01', true, 1), '2027-05-31'), '2027-06-01')
  eq('completed recurring still reminds', R.reminderDueOn(ev('2000-05-10', true, 1, true), '2026-05-09'), '2026-05-10')
  // 29 Feb
  eq('29 Feb H-1 in non-leap year → Mar 1', R.reminderDueOn(ev('2024-02-29', true, 1), '2027-02-28'), '2027-03-01')
  eq('29 Feb H-0 in non-leap year on Mar 1', R.reminderDueOn(ev('2024-02-29', true, 0), '2027-03-01'), '2027-03-01')
  eq('29 Feb H-1 in leap year → Feb 29', R.reminderDueOn(ev('2024-02-29', true, 1), '2028-02-28'), '2028-02-29')
  eq('29 Feb H-0 not on Mar 1 of a leap year', R.reminderDueOn(ev('2024-02-29', true, 0), '2028-03-01'), null)
  eq('29 Feb H-7 in 2100 (not leap)', R.reminderDueOn(ev('2024-02-29', true, 7), '2100-02-22'), '2100-03-01')
  eq('nextOccurrenceFrom 29 Feb non-leap', R.nextOccurrenceFrom('2024-02-29', true, '2026-10-27'), '2027-03-01')
  // occursOn = calendar page rules
  ok('occursOn recurring yearly', R.occursOn('2020-10-27', true, '2026-10-27') && !R.occursOn('2020-10-27', true, '2019-10-27'))
  ok('occursOn 29 Feb → Mar 1 only in non-leap years', R.occursOn('2024-02-29', true, '2025-03-01') && !R.occursOn('2024-02-29', true, '2028-03-01') && R.occursOn('2024-02-29', true, '2028-02-29'))
  ok('occursOn one-off only its date', R.occursOn('2026-10-27', false, '2026-10-27') && !R.occursOn('2026-10-27', false, '2027-10-27'))
  // B1: my partner's "personal" event is "Pasangan" in my edit form, and saving keeps it theirs
  eq('scope: partner\'s personal shows as partner for me', R.flipScopeForViewer('personal', true), 'partner')
  eq('scope: partner\'s "for partner" shows as personal for me', R.flipScopeForViewer('partner', true), 'personal')
  eq('scope: couple and my own events unchanged', [R.flipScopeForViewer('couple', true), R.flipScopeForViewer('personal', false), R.flipScopeForViewer('partner', false)], ['couple', 'personal', 'partner'])
  ok('scope: edit round-trip keeps the stored value', ['personal', 'partner', 'couple'].every((s) => R.flipScopeForViewer(R.flipScopeForViewer(s, true), true) === s))
  // copy + recipients
  eq('title H-1', R.reminderTitle('Ulang Tahun Nadia', 1), 'Tomorrow: Ulang Tahun Nadia')
  eq('title H-0', R.reminderTitle('Anniversary', 0), 'Today: Anniversary')
  eq('title H-3', R.reminderTitle('Dinner', 3), 'In 3 days: Dinner')
  eq('body with location', R.reminderBody('2026-10-30', 'Monas'), 'Friday, 30 October 2026 · Monas')
  eq('personal → creator only', R.reminderRecipients('personal', 'a', ['a', 'b']), ['a'])
  eq('personal, creator left → nobody', R.reminderRecipients('personal', null, ['a', 'b']), [])
  eq('couple → both', R.reminderRecipients('couple', 'a', ['a', 'b']), ['a', 'b'])
  eq('partner scope → both', R.reminderRecipients('partner', 'a', ['a', 'b']), ['a', 'b'])
}

// ---------------------------------------------------------------- unit: finance
function financeUnits() {
  eq('signedAmount withdrawal negative', F.signedAmount('withdrawal', 5000), -5000)
  eq('signedAmount deposit positive', F.signedAmount('deposit', -5000), 5000)
  eq('shiftMonth wraps years', [F.shiftMonth('2026-01', -1), F.shiftMonth('2026-12', 1)], ['2025-12', '2027-01'])
  eq('jakarta month of 31 Oct 18:00 UTC is November', F.jakartaMonthKey('2026-10-31T18:00:00Z'), '2026-11')
  const txs = [
    { amount: 100000, type: 'deposit', category: 'tabungan', created_by: 'a', created_at: '2026-10-05T03:00:00Z' },
    { amount: -30000, type: 'withdrawal', category: 'belanja', created_by: 'b', created_at: '2026-10-06T03:00:00Z' },
    { amount: -10000, type: 'withdrawal', category: 'date_night', created_by: 'a', created_at: '2026-10-07T03:00:00Z' },
    { amount: -5000, type: 'withdrawal', category: 'belanja', created_by: null, created_at: '2026-10-08T03:00:00Z' },
    { amount: 999, type: 'deposit', category: 'tabungan', created_by: 'a', created_at: '2026-10-31T18:00:00Z' }, // Nov in Jakarta
  ]
  const s = F.summarizeMonth(txs, '2026-10')
  eq('summary totals', [s.count, s.totalIn, s.totalOut, s.net], [4, 100000, 45000, 55000])
  eq('summary by category (largest first)', s.byCategory, [{ category: 'belanja', total: 35000 }, { category: 'date_night', total: 10000 }])
  eq('summary per person', s.countByPerson, { a: 2, b: 1, '': 1 })
  eq('summary next month picks the Jakarta-boundary row', F.summarizeMonth(txs, '2026-11').totalIn, 999)
  eq('error: balance message passed through', F.transactionErrorMessage({ message: 'The savings balance would drop below zero. Edit or delete the withdrawal first.' }), 'The savings balance would drop below zero. Edit or delete the withdrawal first.')
  ok('error: check violation is the English message', /doesn't match the transaction type/.test(F.transactionErrorMessage({ code: '23514', message: 'violates check' })))
}

// ---------------------------------------------------------------- DB: finance
async function financeDb(a, b, c, aid, bid, cid) {
  const { data: g1, error: g1E } = await a.from('savings_goals').insert({ couple_id: cid, name: 'Dana Nikah', target_amount: 1_000_000 }).select().single()
  const { data: g2, error: g2E } = await b.from('savings_goals').insert({ couple_id: cid, name: 'Liburan', target_amount: 500_000 }).select().single()
  ok('create two goals', !g1E && !g2E && g1?.id && g2?.id, g1E?.message ?? g2E?.message)
  const tx = (client, created_by, goal_id, amount, type, category, note) =>
    client.from('couple_transactions').insert({ couple_id: cid, goal_id, amount, type, category, note, created_by }).select().single()

  const { data: depA } = await tx(a, aid, g1.id, 100_000, 'deposit', 'tabungan', 'Gaji A')
  const { data: depB } = await tx(b, bid, g1.id, 50_000, 'deposit', 'tabungan', 'Gaji B')
  const { data: wd } = await tx(a, aid, g1.id, -120_000, 'withdrawal', 'belanja', 'Cincin')
  const { data: depG2 } = await tx(b, bid, g2.id, 70_000, 'deposit', 'tabungan', 'Tiket')
  ok('seed transactions', depA?.id && depB?.id && wd?.id && depG2?.id)
  eq('goal 1 balance after seed', await balanceOf(g1.id), 30_000)

  // F06 edit amount (and the partner may edit too)
  const { error: editE } = await a.from('couple_transactions').update({ amount: 110_000, note: 'Gaji A (revisi)' }).eq('id', depA.id)
  ok('edit amount ok', !editE, editE?.message)
  eq('balance follows the edit', await balanceOf(g1.id), 40_000)
  const { error: partnerEditE } = await b.from('couple_transactions').update({ category: 'date_night' }).eq('id', wd.id)
  ok('partner can edit category', !partnerEditE, partnerEditE?.message)

  // Balance can never go negative through an edit or a delete
  const { error: delNegE } = await a.from('couple_transactions').delete().eq('id', depA.id)
  ok('delete deposit that makes balance negative refused', /savings balance would drop below zero/.test(delNegE?.message ?? ''), delNegE?.message)
  // 110k + 5k − 120k = −5k (lowering to exactly 0 would be allowed)
  const { error: lowerE } = await a.from('couple_transactions').update({ amount: 5_000 }).eq('id', depB.id)
  ok('lowering a deposit below the spending refused', /savings balance would drop below zero/.test(lowerE?.message ?? ''), lowerE?.message)
  const { error: bigWdE } = await a.from('couple_transactions').update({ amount: -200_000 }).eq('id', wd.id)
  ok('raising a withdrawal past the balance refused', /savings balance would drop below zero/.test(bigWdE?.message ?? ''), bigWdE?.message)
  eq('refused changes left the balance as is', await balanceOf(g1.id), 40_000)
  eq('refused delete kept the row', (await admin.from('couple_transactions').select('amount').eq('id', depA.id).single()).data?.amount, 110_000)

  // Sign must follow type
  const { error: signE } = await a.from('couple_transactions').update({ amount: -5_000 }).eq('id', depB.id)
  ok('deposit with negative amount refused', signE?.code === '23514', `${signE?.code} ${signE?.message}`)
  const { error: signInsE } = await tx(a, aid, g1.id, 5_000, 'withdrawal', 'lainnya', 'salah tanda')
  ok('withdrawal with positive amount refused on insert', signInsE?.code === '23514', `${signInsE?.code} ${signInsE?.message}`)
  const { error: typeFlipE } = await a.from('couple_transactions').update({ type: 'withdrawal' }).eq('id', depB.id)
  ok('flipping type without flipping sign refused', typeFlipE?.code === '23514', `${typeFlipE?.code} ${typeFlipE?.message}`)

  // Writer and goal are fixed after insert (column grants)
  const { error: whoE } = await a.from('couple_transactions').update({ created_by: bid }).eq('id', depA.id)
  ok('updating created_by refused', !!whoE, 'no error')
  const { error: goalMoveE } = await a.from('couple_transactions').update({ goal_id: g2.id }).eq('id', depA.id)
  ok('updating goal_id refused', !!goalMoveE, 'no error')
  const { error: coupleMoveE } = await a.from('couple_transactions').update({ couple_id: cid }).eq('id', depA.id)
  ok('updating couple_id refused', !!coupleMoveE, 'no error')

  // Delete a withdrawal
  const { data: delWd, error: delWdE } = await a.from('couple_transactions').delete().eq('id', wd.id).select('id')
  ok('delete withdrawal ok', !delWdE && delWd?.length === 1, delWdE?.message)
  eq('balance after deleting the withdrawal', await balanceOf(g1.id), 160_000)

  // F07 goals stay isolated
  eq('goal 2 untouched by goal 1 changes', await balanceOf(g2.id), 70_000)
  const { error: crossE } = await tx(a, aid, g2.id, -100_000, 'withdrawal', 'lainnya', 'lebih dari saldo goal 2')
  ok('withdrawal limited by its own goal (not the couple total)', /savings balance is too low/.test(crossE?.message ?? ''), crossE?.message)
  const { data: g2Txs } = await a.from('couple_transactions').select('id').eq('goal_id', g2.id)
  eq('filter by goal_id returns only that goal', (g2Txs ?? []).map((t) => t.id), [depG2.id])

  // Another couple can't touch it
  const { data: cUpd } = await c.from('couple_transactions').update({ amount: 1 }).eq('id', depB.id).select('id')
  const { data: cDel } = await c.from('couple_transactions').delete().eq('id', depB.id).select('id')
  const { data: cGoalUpd } = await c.from('savings_goals').update({ name: 'hacked' }).eq('id', g1.id).select('id')
  ok('other couple updates/deletes nothing', (cUpd ?? []).length === 0 && (cDel ?? []).length === 0 && (cGoalUpd ?? []).length === 0)
  eq('row intact after outsider attempts', (await admin.from('couple_transactions').select('amount').eq('id', depB.id).single()).data?.amount, 50_000)
  const { data: cSee } = await c.from('couple_transactions').select('id').eq('couple_id', cid)
  ok('other couple sees no transactions', (cSee ?? []).length === 0)

  // Deleting a goal: one statement, its transactions (withdrawals included) cascade with it
  const { data: g3 } = await a.from('savings_goals').insert({ couple_id: cid, name: 'Hapus aku', target_amount: 100 }).select().single()
  await tx(a, aid, g3.id, 1_000, 'deposit', 'tabungan', 'in')
  await tx(a, aid, g3.id, -800, 'withdrawal', 'lainnya', 'out')
  const { data: g3Del, error: g3DelE } = await a.from('savings_goals').delete().eq('id', g3.id).select('id')
  ok('delete goal with deposits + withdrawals in one call', !g3DelE && g3Del?.length === 1, g3DelE?.message)
  const { count: g3Left } = await admin.from('couple_transactions').select('*', { count: 'exact', head: true }).eq('goal_id', g3.id)
  eq('deleting a goal removes its transactions', g3Left, 0)
  eq('other goals unaffected by deleting one', [await balanceOf(g1.id), await balanceOf(g2.id)], [160_000, 70_000])

  // The partner still has the deleted goal on screen (B2): an edit touches 0 rows,
  // a deposit is refused, and the goal lookup the app then does finds nothing.
  const { data: staleEdit, error: staleEditE } = await b.from('savings_goals').update({ name: 'Masih ada?' }).eq('id', g3.id).select('id')
  ok('editing a deleted goal updates 0 rows (no error)', !staleEditE && (staleEdit ?? []).length === 0, staleEditE?.message)
  const { error: staleDepE } = await tx(b, bid, g3.id, 5_000, 'deposit', 'tabungan', 'telat')
  const { data: staleGoal, error: staleGoalE } = await b.from('savings_goals').select('id').eq('id', g3.id).maybeSingle()
  ok('deposit into a deleted goal refused, goal lookup empty', !!staleDepE && !staleGoalE && staleGoal === null, staleDepE?.message ?? 'no error')
  ok('goal-gone message is the English message', /This savings goal was deleted/.test(F.GOAL_GONE_MESSAGE ?? ''))
}

// ---------------------------------------------------------------- DB: calendar edit
async function calendarDb(a, b, c, aid, cid) {
  const { data: ev, error } = await a.from('couple_events').insert({
    couple_id: cid, title: 'Dinner', event_date: '2026-12-01', event_type: 'date_plan', event_scope: 'couple', created_by: aid,
  }).select().single()
  ok('create event', !error && ev?.id, error?.message)
  const { data: upd, error: updE } = await b.from('couple_events').update({
    title: 'Dinner di Monas', location: 'Monas', budget: 300_000, remind_days_before: 3, is_recurring: false,
  }).eq('id', ev.id).select().single()
  ok('partner edits event incl. reminder', !updE && upd?.title === 'Dinner di Monas' && upd?.remind_days_before === 3, updE?.message)
  const { error: badRemindE } = await a.from('couple_events').update({ remind_days_before: 2 }).eq('id', ev.id)
  ok('reminder outside 0/1/3/7 refused', !!badRemindE)
  const { data: cUpd } = await c.from('couple_events').update({ title: 'hacked' }).eq('id', ev.id).select('id')
  ok('other couple cannot edit event', (cUpd ?? []).length === 0)
  const { error: sentE } = await a.from('event_reminders_sent').insert({ event_id: ev.id, occurrence_date: '2026-12-01' })
  ok('users cannot write event_reminders_sent', !!sentE)
}

// ---------------------------------------------------------------- e2e: cron
async function cronE2e(a, aid, cid) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const tomorrow = R.addDays(today, 1)
  const tag = Math.random().toString(36).slice(2, 7)
  const base = { couple_id: cid, created_by: aid, event_type: 'event', event_scope: 'couple', is_recurring: false }
  const rows = [
    { ...base, title: `H-0 ${tag}`, event_date: today, remind_days_before: 0 },
    { ...base, title: `H-1 ${tag}`, event_date: tomorrow, remind_days_before: 1 },
    { ...base, title: `Pribadi ${tag}`, event_date: today, remind_days_before: 0, event_scope: 'personal' },
    { ...base, title: `Belum ${tag}`, event_date: tomorrow, remind_days_before: 3 },
    { ...base, title: `Tanpa ${tag}`, event_date: today, remind_days_before: null },
  ]
  if (today.slice(5) !== '02-29') {
    rows.push({ ...base, title: `Tahunan ${tag}`, event_date: `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`, is_recurring: true, event_type: 'anniversary', remind_days_before: 0 })
  }
  const { data: evs, error } = await a.from('couple_events').insert(rows).select('id, title, event_date, is_recurring')
  ok('insert reminder events', !error && evs?.length === rows.length, error?.message)
  const id = (prefix) => evs.find((e) => e.title.startsWith(prefix))?.id
  const dueIds = ['H-0', 'H-1', 'Pribadi', 'Tahunan'].map(id).filter(Boolean)
  const notDueIds = ['Belum', 'Tanpa'].map(id)

  const noAuth = await fetch(`${APP}/api/cron/event-reminders`)
  eq('cron without secret → 401', noAuth.status, 401)
  const wrong = await fetch(`${APP}/api/cron/event-reminders`, { headers: { Authorization: 'Bearer wrong' } })
  eq('cron with wrong secret → 401', wrong.status, 401)
  if (!CRON_SECRET) { failures.push('CRON_SECRET missing in env files'); return }

  const call = () => fetch(`${APP}/api/cron/event-reminders`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
  const r1 = await call()
  const j1 = await r1.json().catch(() => ({}))
  ok('cron run 1 → 200', r1.status === 200, `status ${r1.status} ${JSON.stringify(j1)}`)
  ok('cron run 1 reports today (Jakarta)', j1.today === today, `today=${j1.today}`)
  ok('cron run 1 reminded every due event', dueIds.every((d) => j1.reminded?.includes(d)), JSON.stringify(j1))
  ok('cron run 1 skipped not-due events', notDueIds.every((d) => !j1.reminded?.includes(d)))
  ok('cron run 1 due count covers ours', typeof j1.due === 'number' && j1.due >= dueIds.length && typeof j1.sent === 'number', JSON.stringify(j1))

  const { data: sent1 } = await admin.from('event_reminders_sent').select('event_id, occurrence_date').in('event_id', evs.map((e) => e.id))
  const occ = Object.fromEntries((sent1 ?? []).map((s) => [s.event_id, s.occurrence_date]))
  ok('event_reminders_sent written for due events only', (sent1 ?? []).length === dueIds.length && notDueIds.every((d) => !occ[d]), JSON.stringify(sent1))
  eq('H-1 recorded against tomorrow\'s occurrence', occ[id('H-1')], tomorrow)
  if (id('Tahunan')) eq('recurring recorded against this year\'s occurrence', occ[id('Tahunan')], today)

  const r2 = await call()
  const j2 = await r2.json().catch(() => ({}))
  ok('cron run 2 → 200', r2.status === 200, `status ${r2.status}`)
  ok('cron run 2 does not resend', dueIds.every((d) => !j2.reminded?.includes(d)), JSON.stringify(j2))
  const { count: sentCount } = await admin.from('event_reminders_sent').select('*', { count: 'exact', head: true }).in('event_id', evs.map((e) => e.id))
  eq('no duplicate rows after run 2', sentCount, dueIds.length)
}

async function main() {
  reminderUnits()
  financeUnits()

  const a = mk(), b = mk(), c = mk()
  const aid = await signUp(a, 'fa'), bid = await signUp(b, 'fb')
  await signUp(c, 'fc')
  const { data: couple, error: cE } = await a.rpc('create_couple')
  if (cE || !couple?.id) throw new Error(`create_couple: ${cE?.message}`)
  couples.push(couple.id)
  const { error: jE } = await b.rpc('join_couple', { p_code: couple.invite_code })
  if (jE) throw new Error(`join_couple: ${jE.message}`)
  const { data: other } = await c.rpc('create_couple')
  if (other?.id) couples.push(other.id)

  await financeDb(a, b, c, aid, bid, couple.id)
  await calendarDb(a, b, c, aid, couple.id)
  await cronE2e(a, aid, couple.id)
}

try { await main() } catch (e) { failures.push(`crash: ${e.message}`) }
finally {
  // Couples first (cascades goals, transactions, events, reminder rows), then the users.
  if (couples.length) await admin.from('couples').delete().in('id', couples)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('FINANCE-CALENDAR VERIFY PASSED')
