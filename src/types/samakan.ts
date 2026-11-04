// Samakan types.
//
// v2 (2026-11-04, spec docs/superpowers/specs/2026-11-04-samakan-remake.md):
// "answer now, reveal together". Sets of 7 rounds live in samakan_sets /
// samakan_rounds; answers sit in samakan_answers, which only the RPCs in
// supabase/migrations/20261104121000_samakan_v2.sql can read. The Samakan*
// types below mirror what those RPCs return, after the parsers in
// src/components/games/samakan/logic.ts turn snake_case into camelCase.
//
// v1 (the live lobby) is retired: its rows in game_sessions stay readable as
// "Older games" and nothing new is written there. Its types are kept, marked
// @deprecated, until the wave 2 screens replace the old pages.

// ============================================================
// v2: sets, rounds, answers, reveals
// ============================================================

/** Stored round kinds. Labels: "Same page", "Guess me", "On a scale". */
export type SamakanKind = 'match' | 'guess' | 'scale'

/** The six curated bank themes. */
export type SamakanBankTheme = 'food' | 'weekends' | 'home' | 'travel' | 'habits' | 'plans'

/** "personal" is the AI-written "For you two" set; "mixed" is the bank fallback. */
export type SamakanTheme = 'personal' | SamakanBankTheme | 'mixed'

/** Who wrote the set's rounds. */
export type SamakanSource = 'ai' | 'bank'

/** Where a round came from. Bank rounds are always "general". */
export type SamakanRoundSource = 'daily' | 'moments' | 'mood' | 'bucket' | 'general'

export type SamakanSetStatus = 'open' | 'done' | 'ended' | 'expired'

/**
 * Why a "For you two" request became a bank set. The first three never call
 * the model; "cap" means the shared AI budget refused; the rest mean a call was
 * made and failed, so they use up the day's personal set.
 */
export type SamakanFallbackReason =
  | 'daily_limit'
  | 'personal_off'
  | 'no_data'
  | 'cap'
  | 'timeout'
  | 'error'
  | 'refusal'
  | 'max_tokens'
  | 'invalid'

export type SamakanReadoutStatus = 'none' | 'pending' | 'done'

/** Push kinds counted in samakan_push_log (3 per recipient per Jakarta day). */
export type SamakanPushKind = 'start' | 'finish' | 'nudge' | 'live'

/** HINT codes raised by the samakan_* RPCs. */
export type SamakanErrorCode =
  | 'SK_AUTH'
  | 'SK_NO_PARTNER'
  | 'SK_CLOSED'
  | 'SK_NOT_FOUND'
  | 'SK_ENDED'
  | 'SK_INVALID'
  | 'SK_LOCKED'
  | 'SK_SKIPPED'
  | 'SK_ANSWERED'
  | 'SK_SKIP_LIMIT'
  | 'SK_LIMIT'
  | 'SK_EXPIRED'
  | 'SK_DAILY_LIMIT'
  | 'SK_PERSONAL_OFF'

/** A hint code, a dropped connection, or anything else. */
export type SamakanClientError = SamakanErrorCode | 'NETWORK' | 'UNKNOWN'

interface BankRoundBase {
  /** Stable forever: samakan_rounds.bank_id points at it for the 60-day no-repeat rule. */
  id: string
  theme: SamakanBankTheme
  prompt: string
  /** Shown after the reveal under "Talk about it". */
  talk: string
}

/** One curated round in src/data/samakan-bank.ts. */
export type SamakanBankRound =
  | (BankRoundBase & { kind: 'match'; options: readonly [string, string] })
  | (BankRoundBase & { kind: 'guess'; options: readonly [string, string, string, string] })
  | (BankRoundBase & { kind: 'scale'; low: string; high: string })

/**
 * One round as the server inserts it (samakan_insert_set's p_rounds items).
 * Keys are snake_case on purpose: the array goes to the RPC as is.
 */
export interface SamakanRoundDraft {
  kind: SamakanKind
  prompt: string
  /** 2 for match, 4 for guess (already shuffled), none for scale */
  options: string[]
  /** scale only */
  low: string | null
  high: string | null
  talk: string
  source: SamakanRoundSource
  bank_id: string | null
}

/**
 * pick: match 0-1, guess 0-3 (index into options), scale 1-5.
 * guess: null for match, else the guess of the partner's pick (same range).
 */
export interface SamakanAnswer {
  pick: number
  guess: number | null
}

export interface SamakanMyAnswer extends SamakanAnswer {
  answeredAt: string
  updatedAt: string
}

/** A round as samakan_set_state returns it to one partner. */
export interface SamakanRound {
  id: string
  position: number
  kind: SamakanKind
  prompt: string
  options: string[]
  low: string | null
  high: string | null
  talk: string
  source: SamakanRoundSource
  skipped: boolean
  skippedBy: string | null
  /** The partner has locked in (no value, just the fact). */
  partnerAnswered: boolean
  /** Both answered: the reveal is open. */
  revealed: boolean
  revealedAt: string | null
  /** Matches this round scored, once revealed. */
  score: number | null
  /** Wrong guesses this round ("new to you"), once revealed. */
  learned: number | null
  /** My answer. On an ended or expired set only for revealed rounds. */
  mine: SamakanMyAnswer | null
  /** The partner's answer, only once I've answered too. */
  partner: SamakanAnswer | null
}

export interface SamakanLiveInvite {
  id: string
  setId: string
  createdBy: string | null
  recipientId: string | null
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
}

export interface SamakanReadout {
  headline: string
  note: string
  ask: string
  by: 'ai' | 'template'
}

/** A set summary: what the realtime row and the hub carry. Never answer values. */
export interface SamakanSet {
  id: string
  theme: SamakanTheme
  source: SamakanSource
  fallbackReason: SamakanFallbackReason | null
  status: SamakanSetStatus
  createdBy: string | null
  createdAt: string
  /** created_at + 7 days; an open set past this expires on the next hub load */
  expiresAt: string
  /** created_at + 3 hours: the one nudge is allowed from here */
  nudgeAt: string
  nudged: boolean
  finishedAt: string | null
  /** Whoever locked the last answer. */
  finishedBy: string | null
  endedAt: string | null
  endedBy: string | null
  /** Rounds each partner answers: 7 minus skips. */
  total: number
  skips: number
  /** Rounds both answered. */
  revealed: number
  matches: number
  /** Max over revealed rounds; 12 for a finished set with no skips. */
  maxMatches: number
  /** Wrong guesses over revealed rounds ("new things you learned"). */
  learned: number
  progress: { me: number; partner: number }
  readout: SamakanReadout | null
  readoutStatus: SamakanReadoutStatus
  /** Bumped on every answer, skip, end and read-out. */
  version: number
  /** The newest unexpired "Play now together" invite on an open set. */
  liveInvite: SamakanLiveInvite | null
}

export interface SamakanSetState {
  set: SamakanSet
  rounds: SamakanRound[]
  /** This set is the couple's best so far. */
  isBest: boolean
}

export interface SamakanStatPoint {
  setId: string
  matches: number
  maxMatches: number
  at: string
}

export interface SamakanStats {
  /** Highest matches / max among sets with 5+ revealed rounds; ties go to the latest. */
  best: SamakanStatPoint | null
  /** Consecutive Jakarta weeks (Monday start) with a finished set; this week can't break it. */
  streakWeeks: number
  setsPlayed: number
  /** The most recent finished set ("Last time: 9 of 12"). */
  last: SamakanStatPoint | null
}

export interface SamakanHub {
  coupleId: string | null
  me: string
  partnerId: string | null
  hasPartner: boolean
  closed: boolean
  personal: {
    /** couples.samakan_personal: AI may read Daily Question answers, Moment titles and moods. */
    enabled: boolean
    /** The day's "For you two" set is used (Jakarta day). */
    usedToday: boolean
  }
  openSet: SamakanSet | null
  /** Last 20 past sets, newest first: finished ones, plus ended or expired ones with a revealed round. */
  sets: SamakanSet[]
  stats: SamakanStats
  /** Completed v1 games ("Older games"). */
  legacyCount: number
}

export interface SamakanAnswerResult {
  /** This answer opened the reveal (the partner had answered). */
  revealed: boolean
  /** An earlier answer was changed (the partner hadn't answered yet). */
  changed: boolean
  /** This answer finished the set. */
  done: boolean
  version: number
  score: number | null
  learned: number | null
  mine: SamakanAnswer
  partner: SamakanAnswer | null
  matches: number
  maxMatches: number
}

export interface SamakanLiveInviteResult {
  invite: SamakanLiveInvite
  /** A new invite: send the push. */
  created: boolean
  /** The partner had already invited me, so this call accepted theirs instead. */
  joined: boolean
}

export interface SamakanInsertResult {
  id: string
  /** An open set already existed (maybe the partner's); nothing was inserted. */
  existing: boolean
}

/** samakan_history: what the server needs to pick bank rounds and brief the AI. */
export interface SamakanHistory {
  bank: { bankId: string; lastUsed: string }[]
  /** The couple's last 40 prompts, newest first. */
  prompts: string[]
  /** Prompts someone skipped, newest first. */
  skipped: string[]
}

export type SamakanPushRefusal =
  | 'not_found'
  | 'not_member'
  | 'closed'
  | 'invalid'
  | 'self'
  | 'not_open'
  | 'not_done'
  | 'duplicate'
  | 'live'
  | 'too_soon'
  | 'finished'
  | 'no_invite'
  | 'daily_cap'

export type SamakanPushClaim = { ok: true; reason: null } | { ok: false; reason: SamakanPushRefusal }

/** How one revealed round reads for one partner. */
export type SamakanMark = 'same' | 'different' | 'right' | 'close' | 'new'

export interface SamakanReveal {
  kind: SamakanKind
  /** match only */
  samePick: boolean | null
  /** How my guess of the partner's pick landed (guess and scale). */
  myGuess: SamakanMark | null
  /** How the partner's guess of my pick landed (guess and scale). */
  partnerGuess: SamakanMark | null
  score: number
  max: number
  learned: number
}

// ============================================================
// v1 (retired live lobby). Read-only "Older games" from game_sessions.
// ============================================================

/** @deprecated Samakan v1. game_sessions is read-only; v2 uses SamakanSetStatus. */
export type GameStatus = 'waiting' | 'playing' | 'completed' | 'expired'
/** @deprecated Samakan v1 live lobby roles. v2 has no host. */
export type PlayerRole = 'host' | 'guest'
/** @deprecated Samakan v1 round types (stored values in game_sessions.rounds). v2 uses SamakanKind. */
export type RoundType = 'pilih_sama' | 'slider_sama' | 'tebak_angka' | 'tebak_pasangan'

/** @deprecated Samakan v1 live phases. v2 has no lobby, countdown or story cards. */
export type GamePhase =
  | 'connecting'
  | 'lobby'
  | 'countdown'
  | 'story_intro'
  | 'challenge'
  /** Guest reopened a game in progress and waits for the host's sync_state */
  | 'waiting_partner'
  | 'reveal'
  | 'story_bridge'
  | 'story_ending'
  | 'results'
  /** Session expired or a player ended it: nothing left to play */
  | 'ended'

// --- Round Configs ---
/** @deprecated Samakan v1 round config (read by the "Older games" view only). */
export interface PilihSamaConfig {
  type: 'pilih_sama'
  storyPrompt: string
  options: string[]
}

/** @deprecated Samakan v1 round config (read by the "Older games" view only). */
export interface SliderSamaConfig {
  type: 'slider_sama'
  storyPrompt: string
  question: string
  minLabel: string
  maxLabel: string
}

/** @deprecated Samakan v1 round config (read by the "Older games" view only). */
export interface TebakAngkaConfig {
  type: 'tebak_angka'
  storyPrompt: string
  question: string
}

/** @deprecated Samakan v1 round config (read by the "Older games" view only). */
export interface TebakPasanganConfig {
  type: 'tebak_pasangan'
  storyPrompt: string
  questionForSelf: string
  questionForPartner: string
  options: string[]  // multiple choice options
}

/** @deprecated Samakan v1 round config (read by the "Older games" view only). */
export type RoundConfig =
  | PilihSamaConfig
  | SliderSamaConfig
  | TebakAngkaConfig
  | TebakPasanganConfig

// --- Round Result ---
/** @deprecated Samakan v1: one entry of game_sessions.rounds (config + both answers). */
export interface RoundResult {
  type: RoundType
  roundIndex: number
  config: RoundConfig
  hostAnswer: unknown
  guestAnswer: unknown
  score: number
}

// --- Chapter ---
/** @deprecated Samakan v1 chapters (src/data/samakan.ts). v2 uses the bank in src/data/samakan-bank.ts. */
export interface Chapter {
  id: string
  title: string
  subtitle: string
  gradient: string
  bgClass: string
  intro: string
  bridges: string[]
  endings: {
    high: string
    mid: string
    low: string
  }
  rounds: RoundConfig[]
}

// --- Broadcast Events ---
// Lobby readiness and "who is here" live in presence ({ user_id, ready }),
// not in broadcasts, so they survive reconnects.
/** @deprecated Samakan v1 broadcast protocol. v2 has no broadcast game protocol. */
export type BroadcastPayload =
  | { type: 'game_start'; rounds: RoundConfig[]; startAt: number }
  | { type: 'round_start'; roundIndex: number }
  | { type: 'player_answer'; playerId: string; roundIndex: number; answer: unknown }
  | { type: 'round_reveal'; roundIndex: number; result: RoundResult; totalScore: number }
  | { type: 'game_complete'; totalScore: number; results: RoundResult[] }
  /** Host to guest snapshot after a (re)join or a request_sync */
  | { type: 'sync_state'; phase: GamePhase; currentRound: number; results: RoundResult[]; totalScore: number }
  /** Guest asks the host for a sync_state (guest reopened a running game) */
  | { type: 'request_sync'; playerId: string }
  /** Host moved past a story card; guest applies it only when behind */
  | { type: 'story_next'; phase: GamePhase; round: number }
  /** A player closed the game; the session is now expired */
  | { type: 'session_ended'; playerId: string }

/** @deprecated Samakan v1 presence shape (key = user id). */
export interface GamePresence {
  user_id: string
  ready: boolean
}

// --- Game Session (DB row) ---
/** @deprecated Samakan v1 game_sessions row. Read-only since 20261104121000_samakan_v2.sql. */
export interface GameSession {
  id: string
  couple_id: string
  created_by: string
  partner_id: string | null
  chapter_id: string
  status: GameStatus
  rounds: RoundResult[]
  round_types: string[]
  total_score: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}
