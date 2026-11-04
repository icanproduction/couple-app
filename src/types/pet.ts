// Pet Kita types.
//
// The remake (docs/superpowers/specs/2026-11-04-pet-remake.md) keeps every rule
// in the database: public.pet_rules() is the single source of the numbers and
// PET_RULES below mirrors it exactly (scripts/verify/pet-rules.mjs fails when
// the two drift apart). Warmth, caps, levels and state are computed by the
// database (pet_award, pet_say_hi, pet_status); the client shows them.
//
// The care-chart exports further down belong to the old pet screens and stay
// only until those screens are replaced.

export type PetType = 'cat' | 'dog'

// ---------------------------------------------------------------------------
// Remake: shared types
// ---------------------------------------------------------------------------

/** The free taps on the pet screen. The first one of the day is the hi. */
export type Gesture = 'pat' | 'snack' | 'play'

/** pet_status().mood. "dozy" is shown as "napping". */
export type PetState = 'glowing' | 'cozy' | 'dozy'

export type PetStage = 'little' | 'growing' | 'grown' | 'wise'

/** Where a ledger row came from. "legacy" holds the XP a pet had before the remake. */
export type WarmthSource =
  | 'hi' | 'hi_both' | 'kangen' | 'mood' | 'daily' | 'moment' | 'moment_social'
  | 'letter' | 'jar' | 'bucket_done' | 'plan' | 'saving' | 'game' | 'legacy'

export type GameKind = 'samakan' | 'two_truths' | 'deep_talk'

export type PetNoteKind = 'daily' | 'weekly'
export type PetNoteStatus = 'pending' | 'ready'
export type PetNoteSource = 'ai' | 'template'
export type PetNotePose = 'glowing' | 'cozy' | 'comfort' | 'proud'

/** Error hints raised by the pet RPCs. */
export type PetErrorHint = 'PET_AUTH' | 'PET_NO_COUPLE' | 'PET_CLOSED' | 'PET_NOT_FOUND' | 'PET_INVALID'

/** A row of couple_pets. */
export interface PetRow {
  id: string
  couple_id: string
  pet_type: PetType
  name: string
  level: number
  /** Lifetime warmth (shown as "warmth"). Equals the sum of the ledger. */
  xp: number
  created_at: string | null
  /** Set once everyone in the couple has said hi; existing pets were already home. */
  hatched_at: string | null
}

/** One hi in pet_status().said_hi_today. Presence only, never a count. */
export interface PetHi {
  profile_id: string
  gesture: Gesture | null
  at: string
}

/** pet_status(p_pet_id?): null while the couple has no pet yet. */
export interface PetStatus {
  pet_id: string
  couple_id: string
  name: string
  pet_type: PetType
  created_at: string | null
  level: number
  xp: number
  /** Warmth inside the current level, 0 to xp_per_level - 1. */
  into_level: number
  xp_per_level: number
  stage: PetStage
  mood: PetState
  /** Non-legacy warmth in the last 72 hours. */
  warmth_72h: number
  /** Members whose mood today is heavy (comfort pose). Empty when none. */
  comfort_for: string[]
  said_hi_today: PetHi[]
  both_today: boolean
  hatched: boolean
  hatched_at: string | null
  /** The pet moved in from the old care room (show the intro once per person). */
  migrated: boolean
  /** 22:00 to 05:59 Jakarta time. */
  night: boolean
  /** Jakarta date the status was computed for (YYYY-MM-DD). */
  day: string
}

/** pet_say_hi(p_gesture). */
export interface HiResult {
  /** false when this person already said hi today (nothing changed). */
  counted: boolean
  /** Warmth added by this call: 5, 10 with the both-of-you bonus, 0 when not counted. */
  points: number
  both_today: boolean
  level: number
  xp: number
  leveled_up: boolean
  hatched: boolean
  just_hatched: boolean
}

/** A row of pet_warmth_events. */
export interface PetWarmthEvent {
  id: string
  pet_id: string
  couple_id: string
  actor_id: string | null
  source: WarmthSource
  ref_id: string | null
  gesture: Gesture | null
  /** For source "game": which game. */
  detail: GameKind | null
  points: number
  day: string
  created_at: string
}

/** A row of pet_daily_notes (one per pet per Jakarta day). */
export interface PetNote {
  pet_id: string
  couple_id: string
  note_date: string
  kind: PetNoteKind
  status: PetNoteStatus
  source: PetNoteSource | null
  title: string | null
  line: string | null
  highlight: string | null
  pose: PetNotePose | null
  model: string | null
  input_tokens: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  attempts: number
  created_at: string
  updated_at: string
}

/** pet_claim_note(p_pet_id, p_note_date?, p_kind?), service role only. */
export interface PetNoteClaim {
  /** true: this caller may call the model now. */
  claimed: boolean
  /** Why not: a ready note exists, another request is on it, attempts or budget used up, or no warmth in 7 days. */
  reason: 'ready' | 'busy' | 'attempts' | 'budget' | 'quiet' | null
  attempt: number
  note: PetNote | null
}

/** A row of pet_visits. */
export interface PetVisit {
  pet_id: string
  profile_id: string
  last_seen_at: string
  celebrated_level: number
  intro_seen_at: string | null
  created_at: string
}

/** pet_mark_visit(p_pet_id?, p_celebrated_level?, p_intro_seen?). */
export interface PetVisitResult {
  first_visit: boolean
  /** The visit before this one: "Since your last visit" starts here. */
  previous_seen_at: string | null
  last_seen_at: string
  celebrated_level: number
  intro_seen_at: string | null
  level: number
}

// ---------------------------------------------------------------------------
// Remake: rules mirror (must equal public.pet_rules())
// ---------------------------------------------------------------------------

export const PET_RULES = {
  version: 1,
  xp_per_level: 100,
  daily_cap: 50,
  sources: {
    hi:            { points: 5,  cap: 1, per: 'person' },
    hi_both:       { points: 5,  cap: 1, per: 'couple' },
    kangen:        { points: 3,  cap: 1, per: 'person' },
    mood:          { points: 3,  cap: 1, per: 'person' },
    daily:         { points: 4,  cap: 1, per: 'person' },
    moment:        { points: 10, cap: 2, per: 'couple' },
    moment_social: { points: 2,  cap: 3, per: 'couple' },
    letter:        { points: 8,  cap: 1, per: 'person' },
    jar:           { points: 5,  cap: 1, per: 'person' },
    bucket_done:   { points: 10, cap: 2, per: 'couple' },
    plan:          { points: 2,  cap: 2, per: 'couple' },
    saving:        { points: 4,  cap: 1, per: 'couple' },
    game: {
      points: { samakan: 8, two_truths: 5, deep_talk: 10 },
      cap: 3,
      cap_points: 20,
      per: 'couple',
    },
  },
  state: { window_hours: 72, glowing_min: 45, cozy_min: 8 },
  heavy_moods: ['capek', 'sedih', 'kesal', 'cemas'], // copy-ok: stored values
  night: { from_hour: 22, to_hour: 6 },
  stages: [
    { key: 'little',  label: 'Little',  from_level: 1 },
    { key: 'growing', label: 'Growing', from_level: 5 },
    { key: 'grown',   label: 'Grown',   from_level: 10 },
    { key: 'wise',    label: 'Wise',    from_level: 15 },
  ],
  items: [
    { level: 1,  key: 'bed',           label: 'Bed and bowl',  phrase: 'a bed and a bowl' },
    { level: 2,  key: 'collar_tag',    label: 'Collar tag',    phrase: 'a collar tag with both your initials' },
    { level: 3,  key: 'jar',           label: 'Jar',           phrase: 'a jar with a marble for every Jar note' },
    { level: 4,  key: 'photo_frame',   label: 'Photo frame',   phrase: 'a photo frame for your latest Moment' },
    { level: 5,  key: 'scarf',         label: 'Scarf',         phrase: 'a scarf' },
    { level: 6,  key: 'letter_rack',   label: 'Letter rack',   phrase: 'a letter rack' },
    { level: 7,  key: 'plant',         label: 'Plant',         phrase: 'a little plant' },
    { level: 8,  key: 'wall_calendar', label: 'Wall calendar', phrase: 'a wall calendar' },
    { level: 9,  key: 'window',        label: 'Window',        phrase: 'a window with the Jakarta sky' },
    { level: 10, key: 'hat',           label: 'Hat',           phrase: 'a little hat' },
    { level: 11, key: 'rug',           label: 'Rug',           phrase: 'a rug' },
    { level: 12, key: 'fairy_lights',  label: 'Fairy lights',  phrase: 'fairy lights' },
    { level: 13, key: 'map_board',     label: 'Map board',     phrase: 'a map board' },
    { level: 14, key: 'toy_chest',     label: 'Toy chest',     phrase: 'a toy chest' },
    { level: 15, key: 'glasses',       label: 'Glasses',       phrase: 'a pair of glasses' },
  ],
  extras: {
    star_from_level: 16,
    color_every_levels: 5,
    star_label: 'Star',
    star_phrase: 'a star on the wall',
  },
  limits: {
    name_max: 20,
    calendar_days_max: 60,
    map_pins_max: 20,
    upcoming_days_max: 14,
    since_visit_max: 3,
    notes_max: 30,
  },
  types: ['cat', 'dog'],
  gestures: ['pat', 'snack', 'play'],
  note: {
    opens_hour: 5,
    max_attempts: 2,
    cost_cap_usd: 0.015,
    pending_seconds: 20,
    quiet_days: 7,
    line_max: 160,
    weekly_line_max: 280,
  },
} as const

export type PetItemKey = (typeof PET_RULES.items)[number]['key']
export type PetItem = (typeof PET_RULES.items)[number]

export const PET_GESTURES: readonly Gesture[] = PET_RULES.gestures
export const PET_TYPES: readonly PetType[] = PET_RULES.types

/** level = floor(xp / 100) + 1, the formula the database uses. */
export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / PET_RULES.xp_per_level) + 1
}

/** The stage a level belongs to. */
export function stageForLevel(level: number): PetStage {
  let stage: PetStage = 'little'
  for (const s of PET_RULES.stages) if (level >= s.from_level) stage = s.key
  return stage
}

/** Items earned up to and including this level (one per level up to 15). */
export function itemsForLevel(level: number): PetItem[] {
  return PET_RULES.items.filter((item) => item.level <= level)
}

/** The item the next level brings, or null past the last one (stars from then on). */
export function nextItem(level: number): PetItem | null {
  return PET_RULES.items.find((item) => item.level === level + 1) ?? null
}

// ---------------------------------------------------------------------------
// Old care chart (pet_mood_state, pet_care_logs, pet_care_roles): read-only
// history after the remake. Kept so the current screens compile until they
// are replaced.
// ---------------------------------------------------------------------------

/** @deprecated The remake has no stats; use PetState from pet_status(). */
export type PetMood = 'thriving' | 'happy' | 'neutral' | 'lonely' | 'sad'
/** @deprecated The remake uses Gesture; perform_pet_care now counts as a hi. */
export type CareAction = 'feed' | 'play' | 'bath' | 'treat' | 'walk' | 'cuddle'

/** @deprecated See CareAction. */
export const ALL_CARE_ACTIONS: CareAction[] = ['feed', 'play', 'bath', 'treat', 'walk', 'cuddle']

/** @deprecated Cooldowns and stats are gone; see PET_RULES. */
export const CARE_ACTION_META: Record<CareAction, {
  label: string
  icon: string  // Lucide icon name
  stat: 'hunger' | 'happiness' | 'cleanliness'
  restoreAmount: number
  cooldownMinutes: number
}> = {
  feed:   { label: 'Feed',          icon: 'UtensilsCrossed', stat: 'hunger',      restoreAmount: 40, cooldownMinutes: 240 },
  play:   { label: 'Play',          icon: 'Gamepad2',        stat: 'happiness',   restoreAmount: 30, cooldownMinutes: 120 },
  bath:   { label: 'Give a bath',   icon: 'Droplets',        stat: 'cleanliness', restoreAmount: 50, cooldownMinutes: 360 },
  treat:  { label: 'Give a treat',  icon: 'Cookie',          stat: 'hunger',      restoreAmount: 15, cooldownMinutes: 60 },
  walk:   { label: 'Go for a walk', icon: 'Footprints',      stat: 'happiness',   restoreAmount: 15, cooldownMinutes: 60 },
  cuddle: { label: 'Cuddle',        icon: 'Heart',           stat: 'happiness',   restoreAmount: 15, cooldownMinutes: 60 },
}

/** @deprecated See PetMood. */
export const MOOD_META: Record<PetMood, {
  label: string
  description: string
  color: string
  bgColor: string
}> = {
  thriving: { label: 'Thriving', description: 'On top of the world. You two make a great team.',               color: '#3A9E5A', bgColor: '#E0F5EC' },
  happy:    { label: 'Happy',    description: 'Happy and well looked after.',                                  color: '#C09020', bgColor: '#FFF8DC' },
  neutral:  { label: 'Neutral',  description: 'Doing okay, but something needs attention.',                    color: '#807060', bgColor: '#F0E8E0' },
  lonely:   { label: 'Lonely',   description: 'Feeling lonely... and could use some attention from you two.',  color: '#C06030', bgColor: '#FFF0E0' },
  sad:      { label: 'Sad',      description: 'Sad after going too long without care.',                        color: '#5070A0', bgColor: '#E0EEFF' },
}

/** @deprecated Use PetRow (adds hatched_at). */
export interface CouplePet {
  id: string
  couple_id: string
  pet_type: PetType
  name: string
  level: number
  xp: number
  created_at: string
  hatched_at?: string | null
}

/** @deprecated Read-only history. */
export interface PetMoodState {
  id: string
  pet_id: string
  mood: PetMood
  hunger: number
  happiness: number
  cleanliness: number
  thriving_since: string | null
  updated_at: string
}

/** @deprecated Read-only history; anyone can do anything now. */
export interface PetCareRole {
  id: string
  couple_id: string
  pet_id: string
  profile_id: string
  actions: CareAction[]
}

/** @deprecated Read-only history. */
export interface PetCareLog {
  id: string
  pet_id: string
  action_type: CareAction
  done_by: string
  done_at: string
}

/** @deprecated See PetStatus. */
export interface PetWithMood extends CouplePet {
  mood_state: PetMoodState
}
