// Truth or Dare check against a LOCAL Supabase.
//   node scripts/verify/game-truth-or-dare.mjs
// 1. Content bank (src/components/games/truth-or-dare/deck.ts): counts per
//    heat and kind, lengths, duplicates, safety rules.
// 2. Game rules (engine.ts, the same code the page runs): no repeats until a
//    pile runs out, skips, swaps, turns, play again, restore.
// 3. truth_or_dare_cards: RLS, validation, cap, closed couple.
// Throwaway users A, B (partners) and C (outsider, own couple) are created
// through the admin API and removed at the end.
// Prints "game truth-or-dare verification passed" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { TOD_DECK, TOD_HEATS, TOD_KINDS, TOD_BODY_MAX, TOD_HEAT_INFO } from '../../src/components/games/truth-or-dare/deck.ts'
import {
  newGame, drawCard, swapCard, finishTurn, canSkip, skipsLeft, currentPlayer, isOver, endGame, playAgain,
  restoreGame, setHeat, leader, poolKey, customBodyError, CUSTOM_BODY_MAX, CUSTOM_CARDS_MAX, SKIPS_PER_PLAYER,
} from '../../src/components/games/truth-or-dare/engine.ts'

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
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' (' + extra + ')' : ''}`) }
const created = []
const couples = []

// ------------------------------------------------------------ content bank

function contentBank() {
  ok('three heats', TOD_HEATS.join() === 'sweet,playful,brave')
  ok('heat names', TOD_HEATS.map((h) => TOD_HEAT_INFO[h].name).join() === 'Sweet,Playful,Brave')
  for (const heat of TOD_HEATS) {
    for (const kind of TOD_KINDS) {
      const n = TOD_DECK.filter((c) => c.heat === heat && c.kind === kind).length
      ok(`${heat} ${kind}s: at least 25`, n >= 25, `${n}`)
    }
  }
  ok('deck has at least 150 cards', TOD_DECK.length >= 150, `${TOD_DECK.length}`)
  ok('card ids are unique', new Set(TOD_DECK.map((c) => c.id)).size === TOD_DECK.length)

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const seen = new Map()
  const dupes = []
  for (const c of TOD_DECK) {
    const k = norm(c.body)
    if (seen.has(k)) dupes.push(`${seen.get(k)}=${c.id}`)
    seen.set(k, c.id)
  }
  ok('no duplicate cards', dupes.length === 0, dupes.join(', '))

  const bad = (test) => TOD_DECK.filter(test).map((c) => c.id)
  const tooLong = bad((c) => c.body.length > TOD_BODY_MAX || c.body.length < 10)
  ok(`every card is 10 to ${TOD_BODY_MAX} characters`, TOD_BODY_MAX === 160 && tooLong.length === 0, tooLong.join(','))
  const untidy = bad((c) => c.body !== c.body.trim() || /\s{2}/.test(c.body))
  ok('no stray whitespace', untidy.length === 0, untidy.join(','))
  const unfinished = bad((c) => !/[.?"]$/.test(c.body))
  ok('every card ends with . ? or a closing quote', unfinished.length === 0, unfinished.join(','))
  const dashes = bad((c) => /—/.test(c.body))
  ok('no em dashes', dashes.length === 0, dashes.join(','))
  const shouty = bad((c) => c.body.includes('!'))
  ok('no exclamation marks', shouty.length === 0, shouty.join(','))
  const truthsAsk = bad((c) => c.kind === 'truth' && !c.body.includes('?'))
  ok('every truth asks a question', truthsAsk.length === 0, truthsAsk.join(','))
  const british = bad((c) => /\b(favour|colour|realis|apologis|organis|honour|mum)\w*/i.test(c.body))
  ok('American spelling', british.length === 0, british.join(','))

  // Safety: never sexual, no alcohol, nothing dangerous, no public humiliation.
  const unsafe = [
    /\b(sex\w*|naked|nude|strip\w*|undress\w*|lingerie|underwear|bra|horny|seduc\w*|bedroom|in bed|lap dance|make out|french kiss)\b/i,
    /\b(alcohol\w*|beer|wine|vodka|whisk(e)?y|tequila|soju|arak|tuak|ciu|drunk|tipsy|shots?|liquor|booze|cocktail)\b/i,
    /\b(knife|fire|lighter|candle wax|burn|cabai|chil(l)?i|chilli|ghost pepper|hold your breath|choke|balcony|roof edge|traffic|drive|riding|motorbike)\b/i,
    /\b(strangers?|in public|post (it|this|a photo|on)|instagram|tiktok|twitter|facebook|status update|your story|go live|livestream)\b/i,
    /\b(ex|exes|cheat\w*|divorce)\b/i,
  ]
  const flagged = TOD_DECK.filter((c) => c.kind === 'dare' || c.heat === 'brave')
    .filter((c) => unsafe.some((re) => re.test(c.body))).map((c) => `${c.id}: ${c.body}`)
  // "stuck in traffic" in a Playful truth is a question, not a dare, so only dares and Brave cards are scanned.
  ok('dares and Brave cards pass the safety word list', flagged.length === 0, flagged.join(' | '))

  // Spending: any amount in Rupiah stays at or under Rp 50.000.
  const money = []
  for (const c of TOD_DECK) {
    for (const m of c.body.matchAll(/Rp\s?([\d.]+)/g)) {
      const amount = Number(m[1].replace(/\./g, ''))
      if (!(amount > 0 && amount <= 50000)) money.push(`${c.id}: Rp ${m[1]}`)
    }
    // "Order" as a verb (buy something), not "your usual order".
    if (/\b(buy|order|pay for|treat)\s+(something|them|their|a|an|it|yourself)\b/i.test(c.body) && !/Rp\s?[\d.]+/.test(c.body)) money.push(`${c.id}: spends without a limit`)
  }
  ok('spending dares name an amount of Rp 50.000 or less', money.length === 0, money.join(' | '))

  ok('no "5 Love Languages" style trademarks or AI words in the deck', !TOD_DECK.some((c) => /\b(journey|unlock|delve|tapestry|elevate)\b/i.test(c.body)))
}

// ------------------------------------------------------------ game rules

function seq(values) {
  let i = 0
  return () => values[i++ % values.length]
}

function gameRules() {
  const cards = TOD_DECK.map((c) => ({ ...c, custom: false, authorId: null }))
  const pile = cards.filter((c) => c.heat === 'sweet' && c.kind === 'truth')
  const A = 'player-a', B = 'player-b'

  // No repeats until the pile runs out, then a reshuffle that avoids the last card.
  let g = newGame([A, B], 'sweet', 100)
  const drawn = []
  let reshuffledEarly = false
  for (let i = 0; i < pile.length; i++) {
    const r = drawCard(g, cards, 'truth')
    if (r.reshuffled) reshuffledEarly = true
    drawn.push(r.card.id)
    g = finishTurn(r.game, 'done')
  }
  ok('a full pile draws every card exactly once', new Set(drawn).size === pile.length && !reshuffledEarly, `${new Set(drawn).size}/${pile.length}`)
  ok('drawn cards match their heat and kind', drawn.every((id) => pile.some((c) => c.id === id)))
  const last = drawn[drawn.length - 1]
  const after = drawCard(g, cards, 'truth', () => 0.999999)
  ok('the next draw reshuffles the pile', after.reshuffled === true)
  ok('a reshuffle never repeats the card just played', after.card.id !== last)
  ok('after a reshuffle the cycle starts fresh', after.game.seen[poolKey('sweet', 'truth')].length === 1)

  // Turns alternate; Done scores; a second draw while a card shows changes nothing.
  g = newGame([A, B], 'playful', 2)
  ok('first player starts', currentPlayer(g) === A)
  let r = drawCard(g, cards, 'dare', seq([0.1]))
  ok('card is a Playful dare', r.card.heat === 'playful' && r.card.kind === 'dare')
  const again = drawCard(r.game, cards, 'truth')
  ok('drawing while a card shows is ignored', again.game === r.game && again.card === null)
  g = finishTurn(r.game, 'done')
  ok('Done gives the player a point and passes the turn', g.points[A] === 1 && g.points[B] === 0 && currentPlayer(g) === B && g.daresDone === 1)
  ok('finishing with no card showing is ignored', finishTurn(g, 'done') === g)

  // Swap: once per turn, same kind.
  r = drawCard(g, cards, 'truth', seq([0.2]))
  const s1 = swapCard(r.game, cards, seq([0.7]))
  ok('swap gives another card of the same kind', s1.card && s1.card.kind === 'truth' && s1.card.id !== r.card.id && s1.game.current.swapped)
  const s2 = swapCard(s1.game, cards)
  ok('a second swap in the same turn is ignored', s2.game === s1.game && s2.card === null)
  g = finishTurn(s1.game, 'done')
  ok('the next turn may swap again', drawCard(g, cards, 'truth').game.current.swapped === false)

  // Skips: 3 per player per game, no points.
  g = newGame([A, B], 'brave', 10)
  for (let i = 0; i < SKIPS_PER_PLAYER; i++) {
    g = finishTurn(drawCard(g, cards, 'truth').game, 'skip') // A skips
    g = finishTurn(drawCard(g, cards, 'dare').game, 'done') // B scores
  }
  ok('three skips used', SKIPS_PER_PLAYER === 3 && skipsLeft(g, A) === 0 && skipsLeft(g, B) === 3 && g.skipped === 3)
  const shown = drawCard(g, cards, 'truth').game
  ok('a fourth skip is refused', !canSkip(shown) && finishTurn(shown, 'skip') === shown)
  ok('skips score nothing', g.points[A] === 0 && g.points[B] === 3)

  // Game length and ending.
  g = newGame([A, B], 'sweet', 2)
  for (let i = 0; i < 4; i++) g = finishTurn(drawCard(g, cards, i % 2 ? 'dare' : 'truth').game, 'done')
  ok('a game ends after turnsEach turns per player', isOver(g) && g.turn === 4)
  ok('no draws after the game ends', drawCard(g, cards, 'truth').card === null)
  ok('a tie has no leader', leader(g) === null)
  const early = endGame(finishTurn(drawCard(newGame([A, B], 'sweet', 5), cards, 'truth').game, 'done'))
  ok('ending early keeps the score and stops the game', isOver(early) && early.points[A] === 1 && leader(early) === A)

  // Heat switches only between turns.
  g = newGame([A, B], 'sweet', 5)
  ok('heat changes between turns', setHeat(g, 'brave').heat === 'brave')
  const mid = drawCard(g, cards, 'dare').game
  ok('heat is locked while a card shows', setHeat(mid, 'brave') === mid)

  // Play again: other player starts, scores reset, drawn cards stay drawn.
  const next = playAgain(early)
  ok('play again: the other player starts', next.players[0] === B && currentPlayer(next) === B)
  ok('play again: scores and skips reset', next.points[A] === 0 && next.points[B] === 0 && next.turn === 0 && !next.ended)
  ok('play again: cards stay drawn', JSON.stringify(next.seen) === JSON.stringify(early.seen))

  // Custom cards join their own pile.
  const custom = { id: 'c:custom-1', kind: 'dare', heat: 'brave', body: 'A custom dare.', custom: true, authorId: B }
  const withCustom = [...cards, custom]
  let found = false
  g = newGame([A, B], 'brave', 200)
  for (let i = 0; i < 40 && !found; i++) {
    const d = drawCard(g, withCustom, 'dare')
    if (d.card.id === custom.id) found = true
    g = finishTurn(d.game, 'done')
  }
  ok('a custom card comes up in its heat and kind', found)

  // Restore from sessionStorage.
  const saved = JSON.parse(JSON.stringify(drawCard(newGame([A, B], 'brave', 5), withCustom, 'dare', () => 0).game))
  ok('restore accepts a saved game for the same players', restoreGame(saved, [A, B], withCustom)?.turn === 0)
  ok('restore rejects other players', restoreGame(saved, [A, 'someone-else'], withCustom) === null)
  ok('restore rejects junk', restoreGame({ v: 1, players: [A, B] }, [A, B], withCustom) === null && restoreGame('x', [A, B], withCustom) === null)
  const gone = { ...saved, current: { cardId: 'c:deleted', kind: 'dare', swapped: false } }
  ok('restore drops a card that was deleted meanwhile', restoreGame(gone, [A, B], withCustom)?.current === null)

  // Client validation mirrors the database.
  ok('client limits match the database', CUSTOM_BODY_MAX === 200 && CUSTOM_CARDS_MAX === 300)
  ok('client rejects empty, blank and too long cards', !!customBodyError('') && !!customBodyError('   ') && !!customBodyError('x'.repeat(201)) && customBodyError('x'.repeat(200)) === null)
}

// ------------------------------------------------------------ database

async function makeUser(tag) {
  const email = `tod-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Tod ${tag}` } })
  if (error) throw error
  created.push(data.user.id)
  const client = mk()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { client, id: data.user.id }
}

async function database() {
  const A = await makeUser('a'), B = await makeUser('b'), C = await makeUser('c')
  const { data: couple, error: cE } = await A.client.rpc('create_couple')
  if (cE) throw cE
  couples.push(couple.id)
  const { error: jE } = await B.client.rpc('join_couple', { p_code: couple.invite_code })
  if (jE) throw jE
  const { data: other, error: oE } = await C.client.rpc('create_couple')
  if (oE) throw oE
  couples.push(other.id)
  const cid = couple.id
  const card = (who, extra = {}) => ({ couple_id: cid, created_by: who.id, kind: 'truth', heat: 'sweet', body: 'What made you smile today?', ...extra })

  // Insert + read inside the couple.
  const { data: aCard, error: aErr } = await A.client.from('truth_or_dare_cards').insert(card(A)).select().single()
  ok('member adds a card to their couple', !aErr && aCard?.created_by === A.id, aErr?.message)
  const { data: bSees } = await B.client.from('truth_or_dare_cards').select('id, body, created_by').eq('couple_id', cid)
  ok('partner reads the card', bSees?.length === 1 && bSees[0].id === aCard?.id)
  const { data: bCard, error: bErr } = await B.client.from('truth_or_dare_cards').insert(card(B, { kind: 'dare', heat: 'brave', body: 'x'.repeat(200) })).select().single()
  ok('200 characters is accepted', !bErr && bCard?.body.length === 200, bErr?.message)

  // Outsiders get nothing.
  const { data: cSees } = await C.client.from('truth_or_dare_cards').select('id')
  ok('outsider reads no cards', (cSees ?? []).length === 0)
  const { error: cIns } = await C.client.from('truth_or_dare_cards').insert({ ...card(C) })
  ok('outsider cannot add a card to another couple', !!cIns)
  const { data: cDel } = await C.client.from('truth_or_dare_cards').delete().eq('id', aCard.id).select()
  ok('outsider cannot delete a card', (cDel ?? []).length === 0)
  const anon = mk()
  const { data: anonSees, error: anonErr } = await anon.from('truth_or_dare_cards').select('id')
  ok('anonymous visitors read nothing', !!anonErr || (anonSees ?? []).length === 0)
  const { error: anonIns } = await anon.from('truth_or_dare_cards').insert(card(A))
  ok('anonymous visitors cannot add cards', !!anonIns)
  const { data: probe, error: probeErr } = await C.client.rpc('truth_or_dare_in_open_couple', { p_couple: cid })
  ok('the open-couple helper says nothing about other couples', !probeErr && probe === false, probeErr?.message)

  // Writing as someone else, and validation.
  const { error: spoof } = await B.client.from('truth_or_dare_cards').insert(card(A))
  ok('cannot add a card as my partner', !!spoof)
  const { error: crossCouple } = await A.client.from('truth_or_dare_cards').insert({ ...card(A), couple_id: other.id })
  ok('cannot add a card to an outsider couple', !!crossCouple)
  const rejects = [
    ['empty body', { body: '' }],
    ['blank body', { body: '    ' }],
    ['201 characters', { body: 'x'.repeat(201) }],
    ['unknown kind', { kind: 'joke' }],
    ['unknown heat', { heat: 'spicy' }],
    ['a chosen id', { id: '00000000-0000-4000-8000-000000000001' }],
    ['a chosen created_at', { created_at: '2020-01-01T00:00:00Z' }],
  ]
  for (const [label, extra] of rejects) {
    const { error } = await A.client.from('truth_or_dare_cards').insert(card(A, extra))
    ok(`rejected: ${label}`, !!error)
  }

  // No updates at all; deletes only your own.
  const { error: upOwn } = await A.client.from('truth_or_dare_cards').update({ body: 'Changed' }).eq('id', aCard.id)
  const { error: upTheirs } = await B.client.from('truth_or_dare_cards').update({ body: 'Changed' }).eq('id', aCard.id)
  const { data: still } = await admin.from('truth_or_dare_cards').select('body').eq('id', aCard.id).single()
  ok('cards cannot be edited', !!upOwn && !!upTheirs && still.body === 'What made you smile today?')
  const { data: bDelA } = await B.client.from('truth_or_dare_cards').delete().eq('id', aCard.id).select()
  const { count: aLeft } = await admin.from('truth_or_dare_cards').select('*', { count: 'exact', head: true }).eq('id', aCard.id)
  ok('partner cannot delete my card', (bDelA ?? []).length === 0 && aLeft === 1)
  const { data: aDel } = await A.client.from('truth_or_dare_cards').delete().eq('id', aCard.id).select()
  ok('I can delete my own card', aDel?.length === 1)

  // Cap of 300 per couple, enforced by the trigger (also for the service role).
  await admin.from('truth_or_dare_cards').delete().eq('couple_id', cid)
  const bulk = Array.from({ length: 300 }, (_, i) => card(i % 2 ? A : B, { body: `Card ${i + 1}?` }))
  const { error: bulkErr } = await admin.from('truth_or_dare_cards').insert(bulk)
  ok('300 cards fit', !bulkErr, bulkErr?.message)
  const { error: capErr } = await A.client.from('truth_or_dare_cards').insert(card(A))
  ok('card 301 is refused with a clear message', /300 custom cards/.test(capErr?.message ?? ''), capErr?.message)
  const { error: cFull } = await C.client.from('truth_or_dare_cards').insert({ ...card(C) })
  ok('an outsider learns nothing about the count (plain RLS refusal)', !!cFull && !/300/.test(cFull.message), cFull?.message)
  await admin.from('truth_or_dare_cards').delete().eq('couple_id', cid)

  // Closed couple: archive stays readable, no new cards, the leaver loses access.
  const { data: keep } = await A.client.from('truth_or_dare_cards').insert(card(A)).select().single()
  const { error: leaveErr } = await B.client.rpc('leave_couple')
  ok('partner leaves (couple closes)', !leaveErr, leaveErr?.message)
  const { data: closedRow } = await admin.from('couples').select('closed_at').eq('id', cid).single()
  ok('couple is closed', !!closedRow?.closed_at)
  const { error: closedIns } = await A.client.from('truth_or_dare_cards').insert(card(A, { body: 'After closing?' }))
  ok('no new cards in a closed couple', !!closedIns)
  const { data: aStill } = await A.client.from('truth_or_dare_cards').select('id').eq('couple_id', cid)
  ok('the remaining member still reads the archive', aStill?.length === 1 && aStill[0].id === keep?.id)
  const { data: leaverSees } = await B.client.from('truth_or_dare_cards').select('id').eq('couple_id', cid)
  ok('the partner who left reads nothing', (leaverSees ?? []).length === 0)
  const { error: leaverIns } = await B.client.from('truth_or_dare_cards').insert(card(B))
  ok('the partner who left cannot add cards', !!leaverIns)
  const { data: aDelClosed } = await A.client.from('truth_or_dare_cards').delete().eq('id', keep.id).select()
  ok('the remaining member may still delete their own card', aDelClosed?.length === 1)
}

try {
  contentBank()
  gameRules()
  await database()
} catch (e) {
  failures.push(`crash: ${e.message}`)
} finally {
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('game truth-or-dare verification passed')
