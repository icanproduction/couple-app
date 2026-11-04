// Samakan v2: the game rules that don't need the network. Used by the server
// routes, the screens and scripts/verify/game-samakan.mjs, so this file has no
// runtime imports (Node loads it directly with type stripping).
// The database enforces the same rules
// (supabase/migrations/20261104121000_samakan_v2.sql); keep the two in step.

import type {
  SamakanAnswer, SamakanAnswerResult, SamakanBankRound, SamakanBankTheme, SamakanClientError,
  SamakanFallbackReason, SamakanHistory, SamakanHub, SamakanKind, SamakanLiveInvite,
  SamakanLiveInviteResult, SamakanMark, SamakanMyAnswer, SamakanReadout, SamakanReveal,
  SamakanRound, SamakanRoundDraft, SamakanRoundSource, SamakanSet, SamakanSetState,
  SamakanSetStatus, SamakanSource, SamakanStatPoint, SamakanStats, SamakanTheme,
} from '@/types/samakan'

// ---------- rules (mirrored in SQL) ----------

/** Fixed kind order of every set. */
export const KIND_ORDER: readonly SamakanKind[] = ['match', 'guess', 'scale', 'guess', 'match', 'scale', 'guess']
export const ROUND_COUNT = 7
export const MAX_BY_KIND: Readonly<Record<SamakanKind, number>> = { match: 1, guess: 2, scale: 2 }
/** 2 x match + 3 x guess + 2 x scale */
export const MAX_PER_SET = 12
export const OPTION_COUNT: Readonly<Record<SamakanKind, number>> = { match: 2, guess: 4, scale: 0 }
export const SCALE_MIN = 1
export const SCALE_MAX = 5
export const SKIP_LIMIT = 2
/** Open sets expire after this many days. */
export const SET_DAYS = 7
/** The one nudge is allowed this many hours after start. */
export const NUDGE_AFTER_HOURS = 3
/** A bank round doesn't come back within this many days (unless the bank runs dry). */
export const NO_REPEAT_DAYS = 60
/** Best counts sets with at least this many revealed rounds. */
export const BEST_MIN_REVEALED = 5
export const LIVE_INVITE_MINUTES = 10
export const LIVE_INVITES_PER_DAY = 3
export const PUSHES_PER_DAY = 3
export const PROMPT_MIN = 8
export const PROMPT_MAX = 140
export const OPTION_MAX = 32
export const LABEL_MAX = 32
export const TALK_MAX = 120
export const READOUT_NOTE_MAX = 220

export const BANK_THEMES: readonly SamakanBankTheme[] = ['food', 'weekends', 'home', 'travel', 'habits', 'plans']
export const GAME_PATH = '/app/games/samakan'
export const setPath = (setId: string) => `${GAME_PATH}/set/${setId}`
/** Unsent picks on this phone (every access in try/catch). */
export const draftKey = (setId: string) => `nk:samakan:draft:${setId}`

// ---------- labels ----------

export const THEME_LABELS: Readonly<Record<SamakanTheme, string>> = {
  personal: 'For you two',
  food: 'Food',
  weekends: 'Weekends',
  home: 'Home',
  travel: 'Travel',
  habits: 'Habits',
  plans: 'Plans',
  mixed: 'Mixed set',
}

export const KIND_LABELS: Readonly<Record<SamakanKind, string>> = {
  match: 'Same page',
  guess: 'Guess me',
  scale: 'On a scale',
}

export const MARK_LABELS: Readonly<Record<SamakanMark, string>> = {
  same: 'Same pick',
  different: 'Different picks',
  right: 'Read you right',
  close: 'Close',
  new: 'New to you',
}

export function kindHint(kind: SamakanKind, partner: string): string {
  if (kind === 'match') return 'Pick what you\'d actually want. Match if you agree.'
  if (kind === 'guess') return `Pick your answer, then guess ${partner}'s.`
  return `Rate yourself, then guess where ${partner} lands.`
}

const ERROR_TEXT: Readonly<Record<SamakanClientError, string>> = {
  SK_AUTH: 'Log in to play.',
  SK_NO_PARTNER: 'Samakan needs two. Invite your partner first.',
  SK_CLOSED: 'This couple space is closed, so Samakan is off.',
  SK_NOT_FOUND: 'This set isn\'t here anymore.',
  SK_ENDED: 'This set ended. Rounds you both answered are below.',
  SK_INVALID: 'Pick an answer for each part, then lock in.',
  SK_LOCKED: 'Your partner already answered this one, so it\'s locked.',
  SK_SKIPPED: 'This round was skipped.',
  SK_ANSWERED: 'Someone already answered this one, so it can\'t be skipped.',
  SK_SKIP_LIMIT: 'You can skip 2 rounds per set.',
  SK_LIMIT: 'You\'ve asked to play live 3 times today. Try again tomorrow.',
  SK_EXPIRED: 'That invite ran out. Ask again if you\'re both free.',
  SK_DAILY_LIMIT: 'Today\'s personal set is done. Back tomorrow.',
  SK_PERSONAL_OFF: 'Personal rounds are off for you two.',
  NETWORK: 'Couldn\'t save your answer. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Try again.',
}

const SK_CODES = new Set<string>([
  'SK_AUTH', 'SK_NO_PARTNER', 'SK_CLOSED', 'SK_NOT_FOUND', 'SK_ENDED', 'SK_INVALID', 'SK_LOCKED',
  'SK_SKIPPED', 'SK_ANSWERED', 'SK_SKIP_LIMIT', 'SK_LIMIT', 'SK_EXPIRED', 'SK_DAILY_LIMIT', 'SK_PERSONAL_OFF',
])

/** Maps a Supabase/PostgREST error (or a thrown fetch failure) to a code. */
export function errorCode(error: unknown): SamakanClientError {
  const e = (error ?? {}) as { hint?: unknown; message?: unknown }
  if (typeof e.hint === 'string' && SK_CODES.has(e.hint)) return e.hint as SamakanClientError
  const message = typeof e.message === 'string' ? e.message : String(error ?? '')
  if (/failed to fetch|network|load failed|fetch failed|offline/i.test(message)) return 'NETWORK'
  return 'UNKNOWN'
}

export function errorMessage(code: SamakanClientError): string {
  return ERROR_TEXT[code] ?? ERROR_TEXT.UNKNOWN
}

/** "9 of 12 matches. 3 new things you learned about each other." */
export function resultLine(matches: number, max: number, learned: number): string {
  const first = `${matches} of ${max} ${max === 1 ? 'match' : 'matches'}.`
  if (learned <= 0) return first
  return `${first} ${learned} new ${learned === 1 ? 'thing' : 'things'} you learned about each other.`
}

/** "3 weeks in a row", or null when there's no streak. */
export function streakLine(weeks: number): string | null {
  if (weeks <= 0) return null
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} in a row`
}

// ---------- answers ----------

/** Same checks as samakan_answer: null when the answer fits its kind. */
export function validateAnswer(kind: SamakanKind, pick: number | null | undefined, guess: number | null | undefined): string | null {
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
  if (kind === 'match') {
    if (!whole(pick) || pick < 0 || pick > 1 || (guess !== null && guess !== undefined)) return 'Pick one of the two options.'
    return null
  }
  if (kind === 'guess') {
    if (!whole(pick) || pick < 0 || pick > 3 || !whole(guess) || guess < 0 || guess > 3) return 'Pick your answer and your guess.'
    return null
  }
  if (!whole(pick) || pick < SCALE_MIN || pick > SCALE_MAX || !whole(guess) || guess < SCALE_MIN || guess > SCALE_MAX) {
    return 'Pick a number from 1 to 5 for you and for your guess.'
  }
  return null
}

/** "Lock in" is enabled only when every required pick is made. */
export function canLockIn(kind: SamakanKind, pick: number | null, guess: number | null): boolean {
  return validateAnswer(kind, pick, guess) === null
}

function markFor(kind: SamakanKind, guess: number | null, actual: number): SamakanMark | null {
  if (kind === 'match' || guess === null) return null
  if (guess === actual) return 'right'
  if (kind === 'scale' && Math.abs(guess - actual) === 1) return 'close'
  return 'new'
}

/** Scores one revealed round (same numbers as samakan_score in SQL). */
export function scoreRound(kind: SamakanKind, a: SamakanAnswer, b: SamakanAnswer): { score: number; learned: number; max: number } {
  if (kind === 'match') return { score: a.pick === b.pick ? 1 : 0, learned: 0, max: 1 }
  const aMark = markFor(kind, a.guess, b.pick)
  const bMark = markFor(kind, b.guess, a.pick)
  const score = (aMark === 'right' ? 1 : 0) + (bMark === 'right' ? 1 : 0)
  const learned = (aMark === 'new' ? 1 : 0) + (bMark === 'new' ? 1 : 0)
  return { score, learned, max: MAX_BY_KIND[kind] }
}

/** How one revealed round reads for me. */
export function revealRound(kind: SamakanKind, mine: SamakanAnswer, partner: SamakanAnswer): SamakanReveal {
  const { score, learned, max } = scoreRound(kind, mine, partner)
  return {
    kind,
    samePick: kind === 'match' ? mine.pick === partner.pick : null,
    myGuess: markFor(kind, mine.guess, partner.pick),
    partnerGuess: markFor(kind, partner.guess, mine.pick),
    score,
    max,
    learned,
  }
}

/** Totals over a set's rounds as one partner sees them (revealed, not skipped). */
export function scoreSet(rounds: Pick<SamakanRound, 'kind' | 'skipped' | 'mine' | 'partner'>[]) {
  let matches = 0
  let max = 0
  let learned = 0
  let revealed = 0
  for (const r of rounds) {
    if (r.skipped || !r.mine || !r.partner) continue
    const s = scoreRound(r.kind, r.mine, r.partner)
    matches += s.score
    max += s.max
    learned += s.learned
    revealed++
  }
  return { matches, max, learned, revealed }
}

/** The set's max before anyone answers: 12 minus the max of each skipped round. */
export function setMax(rounds: Pick<SamakanRound, 'kind' | 'skipped'>[]): number {
  return rounds.reduce((sum, r) => sum + (r.skipped ? 0 : MAX_BY_KIND[r.kind]), 0)
}

/** Skip is offered only before either of you answers, and only twice per set. */
export function canSkip(round: Pick<SamakanRound, 'skipped' | 'mine' | 'partnerAnswered'>, skipsUsed: number): boolean {
  return !round.skipped && !round.mine && !round.partnerAnswered && skipsUsed < SKIP_LIMIT
}

/** "Change answer" works until the partner answers that round. */
export function canChange(round: Pick<SamakanRound, 'mine' | 'partnerAnswered'>, status: SamakanSetStatus): boolean {
  return status === 'open' && !!round.mine && !round.partnerAnswered
}

/** The first round I still have to answer, or -1. */
export function nextRoundIndex(rounds: Pick<SamakanRound, 'skipped' | 'mine'>[]): number {
  return rounds.findIndex((r) => !r.skipped && !r.mine)
}

/** When the nudge opens, or null once it's spent or the partner is done. */
export function nudgeOpensAt(set: Pick<SamakanSet, 'status' | 'createdAt' | 'nudged' | 'progress' | 'total'>): Date | null {
  if (set.status !== 'open' || set.nudged || set.progress.partner >= set.total) return null
  return new Date(new Date(set.createdAt).getTime() + NUDGE_AFTER_HOURS * 3600_000)
}

// ---------- the read-out the server falls back to ----------

/** "{matches} of {max} matches. {new} new things you learned. Talk about it: ..." */
export function templateReadout(rounds: Pick<SamakanRound, 'kind' | 'skipped' | 'mine' | 'partner' | 'talk'>[]): SamakanReadout {
  const totals = scoreSet(rounds)
  let biggest: { talk: string; miss: number } | null = null
  for (const r of rounds) {
    if (r.skipped || !r.mine || !r.partner || !r.talk) continue
    // match: different picks; guess: wrong guesses; scale: how far off the guesses were.
    const miss = r.kind === 'match'
      ? (r.mine.pick === r.partner.pick ? 0 : 1)
      : r.kind === 'guess'
        ? Number(r.mine.guess !== r.partner.pick) + Number(r.partner.guess !== r.mine.pick)
        : Math.abs((r.mine.guess ?? r.partner.pick) - r.partner.pick) + Math.abs((r.partner.guess ?? r.mine.pick) - r.mine.pick)
    if (miss > 0 && (!biggest || miss > biggest.miss)) biggest = { talk: r.talk, miss }
  }
  const headline = `${totals.matches} of ${totals.max} ${totals.max === 1 ? 'match' : 'matches'}`
  const note = totals.learned > 0
    ? `${totals.learned} new ${totals.learned === 1 ? 'thing' : 'things'} you learned about each other.`
    : 'You read each other well this time.'
  const ask = biggest?.talk ?? 'Which answer surprised you most?'
  return { headline, note, ask, by: 'template' }
}

// ---------- safety (S1-S7; S8, invented events, needs the context) ----------

const SAFETY: readonly { rule: string; re: RegExp }[] = [
  { rule: 'S1', re: /\b(sex|sexy|sexual|naked|nude|kiss|kissing|lingerie|horny|body|bodies|weight|fat|skinny|diet|belly)\b/i },
  { rule: 'S2', re: /\b(ex|exes|jealous|jealousy|cheat|cheated|cheating|affair|break ?up|breakups?|divorce|crush)\b/i },
  { rule: 'S3', re: /\b(rp\.? ?\d|rupiah|salary|salaries|debt|debts|loan|loans|paycheck|income|million|juta)\b/i },
  { rule: 'S4', re: /\b(religion|religious|church|mosque|temple|pray|prayer|god|allah|jesus|ramadan|lebaran|christmas|politics|political|election|president|in ?laws?|mother in law|father in law)\b/i },
  { rule: 'S5', re: /\b(pregnant|pregnancy|fertility|baby|babies|sick|illness|disease|depressed|depression|anxiety|therapy|therapist|medication|alcohol|beer|wine|drunk|vodka|whisky|soju|cigarettes?|smoke|smoking|vape|drugs?|weed|gamble|gambling|casino|lottery|betting)\b/i },
  { rule: 'S6', re: /\b(annoying|annoy|lazy|messy|selfish|stubborn|rude|dirty|smelly|worst habit|bad habit|flaws?|clingy)\b/i },
  { rule: 'S7', re: /\b(you('ve| have) been (sad|down|upset|angry|stressed)|your mood|mood lately)\b/i },
]

/** The safety rules a text breaks, e.g. ['S2']. Empty when it's fine. */
export function safetyIssues(text: string): string[] {
  return SAFETY.filter((s) => s.re.test(text)).map((s) => s.rule)
}

/** Lowercase words only, for comparing prompts. */
export function normalizePrompt(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** Same words, or 80% overlap of their word sets. */
export function isNearDuplicate(prompt: string, others: readonly string[]): boolean {
  const a = normalizePrompt(prompt)
  const aw = new Set(a.split(' ').filter(Boolean))
  for (const other of others) {
    const b = normalizePrompt(other)
    if (!b) continue
    if (a === b) return true
    const bw = new Set(b.split(' ').filter(Boolean))
    let both = 0
    for (const w of aw) if (bw.has(w)) both++
    const union = aw.size + bw.size - both
    if (union > 0 && both / union >= 0.8) return true
  }
  return false
}

/** Same checks as samakan_insert_set for one round; [] when it fits. */
export function draftProblems(draft: SamakanRoundDraft, position: number): string[] {
  const problems: string[] = []
  if (draft.kind !== KIND_ORDER[position]) problems.push('kind out of order')
  const prompt = draft.prompt.trim()
  if (prompt.length < PROMPT_MIN || prompt.length > PROMPT_MAX) problems.push('prompt length')
  const options = draft.options.map((o) => o.trim())
  if (options.length !== OPTION_COUNT[draft.kind]) problems.push('option count')
  if (options.some((o) => o.length < 1 || o.length > OPTION_MAX)) problems.push('option length')
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) problems.push('options repeat')
  if (draft.kind === 'scale') {
    const low = (draft.low ?? '').trim()
    const high = (draft.high ?? '').trim()
    if (!low || !high || low.length > LABEL_MAX || high.length > LABEL_MAX || low.toLowerCase() === high.toLowerCase()) problems.push('scale labels')
  }
  if (draft.talk.trim().length > TALK_MAX) problems.push('talk length')
  const text = [prompt, ...options, draft.low ?? '', draft.high ?? '', draft.talk].join(' ')
  if (/—/.test(text)) problems.push('long dash')
  for (const rule of safetyIssues(text)) problems.push(`safety ${rule}`)
  return problems
}

// ---------- bank pick ----------

/** A random source in [0, 1); Math.random by default. */
export type Random = () => number

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** One bank round as an insert draft. Guess options are shuffled once, here. */
export function bankDraft(round: SamakanBankRound, random: Random = Math.random): SamakanRoundDraft {
  if (round.kind === 'scale') {
    return { kind: 'scale', prompt: round.prompt, options: [], low: round.low, high: round.high, talk: round.talk, source: 'general', bank_id: round.id }
  }
  const options = round.kind === 'guess' ? shuffled(round.options, random) : [...round.options]
  return { kind: round.kind, prompt: round.prompt, options, low: null, high: null, talk: round.talk, source: 'general', bank_id: round.id }
}

export interface BankPickInput {
  bank: readonly SamakanBankRound[]
  /** A bank theme, or "mixed" for any theme. */
  theme: SamakanBankTheme | 'mixed'
  /** bank_id: when the couple was last dealt it (samakan_history.bank). */
  history: ReadonlyMap<string, string> | Readonly<Record<string, string>>
  now?: Date
  random?: Random
  /** Rounds that must not be used (e.g. already in the set being built). */
  exclude?: ReadonlySet<string>
}

/**
 * Picks 7 rounds in KIND_ORDER. For each slot, in this order of preference:
 * 1. unseen in the last 60 days, from the theme
 * 2. unseen in the last 60 days, from any theme (keeps the no-repeat promise)
 * 3. seen, oldest first (the theme wins a tie)
 * Random within a tier. Throws when the bank lacks a kind entirely.
 */
export function pickBankRounds(input: BankPickInput): SamakanRoundDraft[] {
  const random = input.random ?? Math.random
  const now = (input.now ?? new Date()).getTime()
  const lastUsed = (id: string): number | null => {
    const h = input.history
    const at = h instanceof Map ? h.get(id) : (h as Record<string, string>)[id]
    if (!at) return null
    const t = new Date(at).getTime()
    return Number.isFinite(t) ? t : null
  }
  const windowMs = NO_REPEAT_DAYS * 86_400_000
  const taken = new Set(input.exclude ?? [])
  const inTheme = (r: SamakanBankRound) => input.theme === 'mixed' || r.theme === input.theme
  const drafts: SamakanRoundDraft[] = []

  for (const kind of KIND_ORDER) {
    const pool = input.bank.filter((r) => r.kind === kind && !taken.has(r.id))
    if (!pool.length) throw new Error(`samakan bank has no ${kind} round left`)
    const fresh = (r: SamakanBankRound) => {
      const t = lastUsed(r.id)
      return t === null || now - t >= windowMs
    }
    const tier1 = pool.filter((r) => inTheme(r) && fresh(r))
    const tier2 = pool.filter((r) => fresh(r))
    let chosen: SamakanBankRound
    if (tier1.length) chosen = tier1[Math.floor(random() * tier1.length)]
    else if (tier2.length) chosen = tier2[Math.floor(random() * tier2.length)]
    else {
      chosen = [...pool].sort((a, b) =>
        (lastUsed(a.id) ?? 0) - (lastUsed(b.id) ?? 0)
        || Number(inTheme(b)) - Number(inTheme(a))
        || a.id.localeCompare(b.id))[0]
    }
    taken.add(chosen.id)
    drafts.push(bankDraft(chosen, random))
  }
  return drafts
}

/** samakan_history.bank as a lookup for pickBankRounds. */
export function historyMap(history: Pick<SamakanHistory, 'bank'>): Map<string, string> {
  return new Map(history.bank.map((b) => [b.bankId, b.lastUsed]))
}

// ---------- weeks, streak, best (mirrored in samakan_stats) ----------

const JAKARTA_OFFSET_MS = 7 * 3600_000

/** "YYYY-MM-DD" of the Jakarta date at this instant. */
export function jakartaDate(at: Date | string): string {
  return new Date(new Date(at).getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" of the Monday that starts this instant's Jakarta week. */
export function jakartaWeekStart(at: Date | string): string {
  const local = new Date(new Date(at).getTime() + JAKARTA_OFFSET_MS)
  const fromMonday = (local.getUTCDay() + 6) % 7
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - fromMonday)).toISOString().slice(0, 10)
}

function weekBefore(week: string): string {
  const [y, m, d] = week.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10)
}

/**
 * Consecutive Jakarta weeks (Monday start) with at least one finished set.
 * The current week doesn't break the streak until it ends.
 */
export function weeklyStreak(finishedAt: readonly string[], now: Date = new Date()): number {
  const weeks = new Set(finishedAt.map((t) => jakartaWeekStart(t)))
  let week = jakartaWeekStart(now)
  if (!weeks.has(week)) week = weekBefore(week)
  let streak = 0
  while (weeks.has(week)) {
    streak++
    week = weekBefore(week)
  }
  return streak
}

export interface StatSet {
  id: string
  status: SamakanSetStatus
  matches: number
  maxMatches: number
  revealed: number
  /** finished_at, or ended_at for an ended or expired set */
  at: string
}

/** Highest matches/max among non-open sets with 5+ revealed rounds; ties go to the latest. */
export function bestSet(sets: readonly StatSet[]): StatSet | null {
  let best: StatSet | null = null
  for (const s of sets) {
    if (s.status === 'open' || s.revealed < BEST_MIN_REVEALED || s.maxMatches <= 0) continue
    if (!best) { best = s; continue }
    const diff = s.matches * best.maxMatches - best.matches * s.maxMatches
    const sAt = new Date(s.at).getTime()
    const bestAt = new Date(best.at).getTime()
    const later = sAt > bestAt || (sAt === bestAt && s.id > best.id)
    if (diff > 0 || (diff === 0 && later)) best = s
  }
  return best
}

// ---------- parsing RPC replies ----------

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = num(v, NaN)
  return Number.isNaN(n) ? null : n
}
const bool = (v: unknown): boolean => v === true

const KINDS = new Set<SamakanKind>(['match', 'guess', 'scale'])
const THEMES = new Set<SamakanTheme>(['personal', 'food', 'weekends', 'home', 'travel', 'habits', 'plans', 'mixed'])
const STATUSES = new Set<SamakanSetStatus>(['open', 'done', 'ended', 'expired'])
const ROUND_SOURCES = new Set<SamakanRoundSource>(['daily', 'moments', 'mood', 'bucket', 'general'])

function parseAnswer(v: unknown): SamakanAnswer | null {
  const o = obj(v)
  if (!o || typeof o.pick !== 'number') return null
  return { pick: o.pick, guess: typeof o.guess === 'number' ? o.guess : null }
}

function parseMyAnswer(v: unknown): SamakanMyAnswer | null {
  const base = parseAnswer(v)
  const o = obj(v)
  if (!base || !o) return null
  return { ...base, answeredAt: str(o.answered_at) ?? '', updatedAt: str(o.updated_at) ?? str(o.answered_at) ?? '' }
}

export function parseLiveInvite(v: unknown): SamakanLiveInvite | null {
  const o = obj(v)
  const id = str(o?.id)
  if (!o || !id) return null
  return {
    id,
    setId: str(o.set_id) ?? '',
    createdBy: str(o.created_by),
    recipientId: str(o.recipient_id),
    createdAt: str(o.created_at) ?? '',
    expiresAt: str(o.expires_at) ?? '',
    acceptedAt: str(o.accepted_at),
  }
}

function parseReadout(v: unknown): SamakanReadout | null {
  const o = obj(v)
  if (!o) return null
  const headline = str(o.headline)
  const note = str(o.note)
  const ask = str(o.ask)
  if (!headline || !note || !ask) return null
  return { headline, note, ask, by: o.by === 'ai' ? 'ai' : 'template' }
}

export function parseSet(v: unknown): SamakanSet | null {
  const o = obj(v)
  const id = str(o?.id)
  if (!o || !id) return null
  const theme = str(o.theme) as SamakanTheme | null
  const status = str(o.status) as SamakanSetStatus | null
  const progress = obj(o.progress)
  return {
    id,
    theme: theme && THEMES.has(theme) ? theme : 'mixed',
    source: (o.source === 'ai' ? 'ai' : 'bank') as SamakanSource,
    fallbackReason: (str(o.fallback_reason) as SamakanFallbackReason | null) ?? null,
    status: status && STATUSES.has(status) ? status : 'ended',
    createdBy: str(o.created_by),
    createdAt: str(o.created_at) ?? '',
    expiresAt: str(o.expires_at) ?? '',
    nudgeAt: str(o.nudge_at) ?? '',
    nudged: bool(o.nudged),
    finishedAt: str(o.finished_at),
    finishedBy: str(o.finished_by),
    endedAt: str(o.ended_at),
    endedBy: str(o.ended_by),
    total: num(o.total, ROUND_COUNT),
    skips: num(o.skips),
    revealed: num(o.revealed),
    matches: num(o.matches),
    maxMatches: num(o.max_matches),
    learned: num(o.learned),
    progress: { me: num(progress?.me), partner: num(progress?.partner) },
    readout: parseReadout(o.readout),
    readoutStatus: o.readout_status === 'done' ? 'done' : o.readout_status === 'pending' ? 'pending' : 'none',
    version: num(o.version),
    liveInvite: parseLiveInvite(o.live_invite),
  }
}

export function parseRound(v: unknown): SamakanRound | null {
  const o = obj(v)
  const id = str(o?.id)
  const kind = str(o?.kind) as SamakanKind | null
  if (!o || !id || !kind || !KINDS.has(kind)) return null
  const source = str(o.source) as SamakanRoundSource | null
  return {
    id,
    position: num(o.position),
    kind,
    prompt: str(o.prompt) ?? '',
    options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
    low: str(o.low),
    high: str(o.high),
    talk: str(o.talk) ?? '',
    source: source && ROUND_SOURCES.has(source) ? source : 'general',
    skipped: bool(o.skipped),
    skippedBy: str(o.skipped_by),
    partnerAnswered: bool(o.partner_answered),
    revealed: bool(o.revealed),
    revealedAt: str(o.revealed_at),
    score: numOrNull(o.score),
    learned: numOrNull(o.learned),
    mine: parseMyAnswer(o.mine),
    partner: parseAnswer(o.partner),
  }
}

export function parseSetState(v: unknown): SamakanSetState {
  const o = obj(v)
  const set = parseSet(o?.set)
  if (!o || !set) throw new Error('samakan: malformed set state')
  const rounds = (Array.isArray(o.rounds) ? o.rounds : []).map(parseRound).filter((r): r is SamakanRound => !!r)
  rounds.sort((a, b) => a.position - b.position)
  return { set, rounds, isBest: bool(o.is_best) }
}

function parseStatPoint(v: unknown): SamakanStatPoint | null {
  const o = obj(v)
  const setId = str(o?.set_id)
  if (!o || !setId) return null
  return { setId, matches: num(o.matches), maxMatches: num(o.max_matches), at: str(o.at) ?? '' }
}

export function parseHub(v: unknown): SamakanHub {
  const o = obj(v)
  if (!o) throw new Error('samakan: malformed hub')
  const personal = obj(o.personal)
  const stats = obj(o.stats)
  const parsedStats: SamakanStats = {
    best: parseStatPoint(stats?.best),
    streakWeeks: num(stats?.streak_weeks),
    setsPlayed: num(stats?.sets_played),
    last: parseStatPoint(stats?.last),
  }
  return {
    coupleId: str(o.couple_id),
    me: str(o.me) ?? '',
    partnerId: str(o.partner_id),
    hasPartner: bool(o.has_partner),
    closed: bool(o.closed),
    personal: { enabled: bool(personal?.enabled), usedToday: bool(personal?.used_today) },
    openSet: parseSet(o.open_set),
    sets: (Array.isArray(o.sets) ? o.sets : []).map(parseSet).filter((s): s is SamakanSet => !!s),
    stats: parsedStats,
    legacyCount: num(o.legacy_count),
  }
}

export function parseAnswerResult(v: unknown): SamakanAnswerResult {
  const o = obj(v)
  const mine = parseAnswer(o?.mine)
  if (!o || !mine) throw new Error('samakan: malformed answer reply')
  return {
    revealed: bool(o.revealed),
    changed: bool(o.changed),
    done: bool(o.done),
    version: num(o.version),
    score: numOrNull(o.score),
    learned: numOrNull(o.learned),
    mine,
    partner: parseAnswer(o.partner),
    matches: num(o.matches),
    maxMatches: num(o.max_matches),
  }
}

export function parseLiveInviteResult(v: unknown): SamakanLiveInviteResult {
  const o = obj(v)
  const invite = parseLiveInvite(o?.invite)
  if (!o || !invite) throw new Error('samakan: malformed invite reply')
  return { invite, created: bool(o.created), joined: bool(o.joined) }
}

export function parseHistory(v: unknown): SamakanHistory {
  const o = obj(v)
  const bank = (Array.isArray(o?.bank) ? o.bank : [])
    .map((b) => obj(b))
    .filter((b): b is Json => !!b && typeof b.bank_id === 'string' && typeof b.last_used === 'string')
    .map((b) => ({ bankId: b.bank_id as string, lastUsed: b.last_used as string }))
  const texts = (x: unknown) => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : [])
  return { bank, prompts: texts(o?.prompts), skipped: texts(o?.skipped) }
}

/** Is this live invite still worth showing? */
export function inviteIsLive(invite: SamakanLiveInvite | null, now: Date = new Date()): boolean {
  return !!invite && !invite.acceptedAt && new Date(invite.expiresAt).getTime() > now.getTime()
}
