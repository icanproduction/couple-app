export type GameStatus = 'waiting' | 'playing' | 'completed' | 'expired'
export type PlayerRole = 'host' | 'guest'
export type RoundType = 'pilih_sama' | 'slider_sama' | 'tebak_angka' | 'tebak_pasangan'

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
  /** Session expired or a player ended it — nothing left to play */
  | 'ended'

// --- Round Configs ---
export interface PilihSamaConfig {
  type: 'pilih_sama'
  storyPrompt: string
  options: string[]
}

export interface SliderSamaConfig {
  type: 'slider_sama'
  storyPrompt: string
  question: string
  minLabel: string  // e.g. "Tidak suka"
  maxLabel: string  // e.g. "Sangat suka"
}

export interface TebakAngkaConfig {
  type: 'tebak_angka'
  storyPrompt: string
  question: string
}

export interface TebakPasanganConfig {
  type: 'tebak_pasangan'
  storyPrompt: string
  questionForSelf: string
  questionForPartner: string
  options: string[]  // multiple choice options
}

export type RoundConfig =
  | PilihSamaConfig
  | SliderSamaConfig
  | TebakAngkaConfig
  | TebakPasanganConfig

// --- Round Result ---
export interface RoundResult {
  type: RoundType
  roundIndex: number
  config: RoundConfig
  hostAnswer: unknown
  guestAnswer: unknown
  score: number
}

// --- Chapter ---
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
export type BroadcastPayload =
  | { type: 'game_start'; rounds: RoundConfig[]; startAt: number }
  | { type: 'round_start'; roundIndex: number }
  | { type: 'player_answer'; playerId: string; roundIndex: number; answer: unknown }
  | { type: 'round_reveal'; roundIndex: number; result: RoundResult; totalScore: number }
  | { type: 'game_complete'; totalScore: number; results: RoundResult[] }
  /** Host → guest snapshot after a (re)join or a request_sync */
  | { type: 'sync_state'; phase: GamePhase; currentRound: number; results: RoundResult[]; totalScore: number }
  /** Guest asks the host for a sync_state (guest reopened a running game) */
  | { type: 'request_sync'; playerId: string }
  /** Host moved past a story card; guest applies it only when behind */
  | { type: 'story_next'; phase: GamePhase; round: number }
  /** A player closed the game; the session is now expired */
  | { type: 'session_ended'; playerId: string }

/** Shape each player tracks in the channel's presence (key = user id). */
export interface GamePresence {
  user_id: string
  ready: boolean
}

// --- Game Session (DB row) ---
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
