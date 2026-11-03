// Two Truths & a Lie: the game rules that don't need the network. Used by the
// pages and by scripts/verify/game-two-truths.mjs, so this file has no runtime
// imports (Node loads it directly with type stripping).
// The database enforces the same limits (supabase/migrations/20261103132000_two_truths.sql).

export const STATEMENT_MAX = 120
export const STORY_MAX = 500
export const GAME_PATH = '/app/games/two-truths'
export const STATEMENT_COUNT = 3

export interface Round {
  id: string
  authorId: string | null
  /** I wrote it. */
  mine: boolean
  statements: [string, string, string]
  /** null on a partner's round until I've guessed it */
  lieIndex: number | null
  /** null until revealed to me, or when the author didn't write one */
  story: string | null
  guessIndex: number | null
  guessedAt: string | null
  correct: boolean | null
  createdAt: string
}

export interface TallySide {
  guessed: number
  spotted: number
}

export interface Tally {
  /** Partner's rounds I guessed. */
  you: TallySide
  /** My rounds the partner guessed. */
  partner: TallySide
}

export interface RoundList {
  rounds: Round[]
  tally: Tally
}

export interface GuessResult {
  correct: boolean
  lieIndex: number
  guessIndex: number
  story: string | null
}

export interface Draft {
  statements: string[]
  lieIndex: number | null
  story: string
}

export type DraftProblem =
  | { field: 'statement'; index: number; message: string }
  | { field: 'lie' | 'story' | 'form'; message: string }

/** Every reason the draft can't be sent yet, in screen order. Mirrors the DB checks. */
export function validateDraft(draft: Draft): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (draft.statements.length !== STATEMENT_COUNT) {
    problems.push({ field: 'form', message: 'Write exactly three statements.' })
    return problems
  }
  const trimmed = draft.statements.map((s) => s.trim())
  trimmed.forEach((s, index) => {
    if (s.length === 0) problems.push({ field: 'statement', index, message: 'Write something here.' })
    else if (s.length > STATEMENT_MAX) problems.push({ field: 'statement', index, message: `Keep it to ${STATEMENT_MAX} characters.` })
  })
  const seen = new Map<string, number>()
  trimmed.forEach((s, index) => {
    if (!s) return
    const key = s.toLowerCase()
    if (seen.has(key)) problems.push({ field: 'statement', index, message: `Same as statement ${(seen.get(key) ?? 0) + 1}. Make each one different.` })
    else seen.set(key, index)
  })
  if (draft.lieIndex === null || !Number.isInteger(draft.lieIndex) || draft.lieIndex < 0 || draft.lieIndex >= STATEMENT_COUNT) {
    problems.push({ field: 'lie', message: 'Mark which one is the lie.' })
  }
  if (draft.story.trim().length > STORY_MAX) {
    problems.push({ field: 'story', message: `Keep the story to ${STORY_MAX} characters.` })
  }
  return problems
}

/** A uniform random float in [0, 1) from the platform's secure generator. */
export function secureRandom(): number {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 4294967296
}

/**
 * Shuffle the statements (Fisher–Yates) and follow the lie to its new place,
 * so the order people type in (lie last, usually) gives nothing away.
 */
export function shuffleRound(
  statements: readonly string[],
  lieIndex: number,
  random: () => number = secureRandom,
): { statements: [string, string, string]; lieIndex: number } {
  const order = statements.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const out = order.map((i) => statements[i].trim()) as [string, string, string]
  return { statements: out, lieIndex: order.indexOf(lieIndex) }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const idx = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < STATEMENT_COUNT ? v : null)
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)

function parseSide(v: unknown): TallySide {
  const o = isObj(v) ? v : {}
  return { guessed: count(o.guessed), spotted: count(o.spotted) }
}

/** The two_truths_list() payload, checked field by field (bad rows are dropped). */
export function parseRoundList(raw: unknown): RoundList {
  const o = isObj(raw) ? raw : {}
  const rows = Array.isArray(o.rounds) ? o.rounds : []
  const rounds: Round[] = []
  for (const row of rows) {
    if (!isObj(row)) continue
    const id = str(row.id)
    const createdAt = str(row.created_at)
    const st = Array.isArray(row.statements) ? row.statements : null
    if (!id || !createdAt || !st || st.length !== STATEMENT_COUNT || !st.every((s) => typeof s === 'string')) continue
    const guessedAt = str(row.guessed_at)
    rounds.push({
      id,
      authorId: str(row.author_id),
      mine: row.mine === true,
      statements: [st[0], st[1], st[2]] as [string, string, string],
      lieIndex: idx(row.lie_index),
      story: str(row.story),
      guessIndex: guessedAt ? idx(row.guess_index) : null,
      guessedAt,
      correct: guessedAt && typeof row.correct === 'boolean' ? row.correct : null,
      createdAt,
    })
  }
  const t = isObj(o.tally) ? o.tally : {}
  return { rounds, tally: { you: parseSide(t.you), partner: parseSide(t.partner) } }
}

/** The two_truths_guess() payload. Throws on anything unexpected. */
export function parseGuessResult(raw: unknown): GuessResult {
  const o = isObj(raw) ? raw : null
  const lieIndex = o ? idx(o.lie_index) : null
  const guessIndex = o ? idx(o.guess_index) : null
  if (!o || typeof o.correct !== 'boolean' || lieIndex === null || guessIndex === null) {
    throw new Error('Unexpected reply from the server')
  }
  return { correct: o.correct, lieIndex, guessIndex, story: str(o.story) }
}

export interface RoundGroups {
  /** My round waiting for the partner's guess. */
  myOpen: Round | null
  /** The partner's round waiting for my guess. */
  theirOpen: Round | null
  /** Guessed rounds, both ways, newest first. */
  history: Round[]
}

export function groupRounds(rounds: readonly Round[]): RoundGroups {
  return {
    myOpen: rounds.find((r) => r.mine && !r.guessedAt) ?? null,
    theirOpen: rounds.find((r) => !r.mine && !r.guessedAt) ?? null,
    history: rounds.filter((r) => !!r.guessedAt),
  }
}

/** A round with my fresh guess folded in, before the list reload lands. */
export function applyGuess(round: Round, result: GuessResult, at: string): Round {
  return {
    ...round,
    lieIndex: result.lieIndex,
    guessIndex: result.guessIndex,
    story: result.story,
    correct: result.correct,
    guessedAt: round.guessedAt ?? at,
  }
}

/** The tally with my fresh guess counted, until the list reload includes it. */
export function tallyWithGuess(tally: Tally, result: GuessResult): Tally {
  return {
    ...tally,
    you: { guessed: tally.you.guessed + 1, spotted: tally.you.spotted + (result.correct ? 1 : 0) },
  }
}

/** "You spotted 3 of 5" / "Kezia spotted 2 of 4" / "No guesses yet" */
export function tallyLine(side: TallySide, who: string): string {
  if (side.guessed === 0) return 'No guesses yet'
  return `${who} spotted ${side.spotted} of ${side.guessed}`
}

/** First letter up, for names and "your partner" at the start of a sentence. */
export function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** "Kezia's", "your partner's" */
export function possessive(name: string): string {
  return `${name}'s`
}

/** The partner's name, or "your partner" when we don't have one. */
export function partnerLabel(name: string | null | undefined): string {
  return name?.trim() || 'your partner'
}

const jakartaDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** "Today", "Yesterday", "3 Nov", or "3 Nov 2025" for another year (Asia/Jakarta). */
export function roundDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = jakartaDay(d)
  if (day === jakartaDay(now)) return 'Today'
  if (day === jakartaDay(new Date(now.getTime() - 86400000))) return 'Yesterday'
  const sameYear = day.slice(0, 4) === jakartaDay(now).slice(0, 4)
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** For "Sent …": "today", "yesterday", "on 3 Nov". */
export function sentWhen(iso: string, now: Date = new Date()): string {
  const label = roundDate(iso, now)
  if (label === 'Today' || label === 'Yesterday') return label.toLowerCase()
  return label ? `on ${label}` : 'a while ago'
}

export type ErrorCode =
  | 'TT_AUTH'
  | 'TT_NO_PARTNER'
  | 'TT_CLOSED'
  | 'TT_INVALID'
  | 'TT_OPEN_ROUND'
  | 'TT_NOT_FOUND'
  | 'TT_OWN_ROUND'
  | 'TT_NOT_AUTHOR'
  | 'TT_ALREADY_GUESSED'
  | 'NETWORK'
  | 'UNKNOWN'

const SERVER_CODES: readonly ErrorCode[] = [
  'TT_AUTH', 'TT_NO_PARTNER', 'TT_CLOSED', 'TT_INVALID', 'TT_OPEN_ROUND',
  'TT_NOT_FOUND', 'TT_OWN_ROUND', 'TT_NOT_AUTHOR', 'TT_ALREADY_GUESSED',
]

/** The TT_* code a Supabase error carries in its hint, or a network/unknown fallback. */
export function errorCode(err: { hint?: string | null; message?: string | null; code?: string | null } | null | undefined): ErrorCode {
  const hint = err?.hint ?? ''
  const known = SERVER_CODES.find((c) => c === hint)
  if (known) return known
  if (/failed to fetch|network|load failed|fetch failed/i.test(err?.message ?? '')) return 'NETWORK'
  if (err?.code === 'PGRST301' || err?.code === '28000') return 'TT_AUTH'
  return 'UNKNOWN'
}

/** What to tell the person. `partner` is a name or "your partner". */
export function errorText(code: ErrorCode, partner: string, serverMessage?: string | null): string {
  switch (code) {
    case 'TT_AUTH': return 'Your session ended. Log in again to keep playing.'
    case 'TT_NO_PARTNER': return `${cap(partner)} has to join before you can play.`
    case 'TT_CLOSED': return 'This couple space is closed, so the game is read-only now.'
    case 'TT_INVALID': return serverMessage ? `${serverMessage}.` : 'Check your three statements and try again.'
    case 'TT_OPEN_ROUND': return `You already have a round waiting for ${partner}. Cancel it to write a new one.`
    case 'TT_NOT_FOUND': return `This round isn't here anymore. ${cap(partner)} may have canceled it.`
    case 'TT_OWN_ROUND': return `You wrote this one, so ${partner} does the guessing.`
    case 'TT_NOT_AUTHOR': return `Only ${partner} can cancel this round.`
    case 'TT_ALREADY_GUESSED': return 'This round has already been guessed.'
    case 'NETWORK': return "Couldn't reach Nanti Kita. Check your connection and try again."
    default: return 'Something went wrong. Try again in a moment.'
  }
}
