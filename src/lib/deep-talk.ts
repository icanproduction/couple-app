import { createClient } from '@/lib/supabase'

export interface DeepTalkPack {
  id: string
  slug: string
  title: string
  description: string | null
  icon_name: string | null
  color: string | null
  sort_order: number | null
  is_published: boolean | null
  /** Every level open for every couple: no premium, no level order */
  is_free: boolean
}

export interface DeepTalkLevel {
  id: string
  pack_id: string
  level_number: number
  title: string
  description: string | null
  question_count: number | null
}

export interface DeepTalkQuestion {
  id: string
  level_id: string
  question_text: string
  sort_order: number | null
  target_partner: number | null
  is_active: boolean | null
}

export interface DeepTalkProgress {
  id: string
  couple_id: string
  pack_id: string
  level_number: number
  current_question_index: number
  completed_levels: number[]
  is_completed: boolean | null
  last_played_at: string | null
}

export type LevelStatus = 'coming_soon' | 'locked' | 'premium_locked' | 'unlocked' | 'completed'

/** A level is playable only when it has at least one active question. */
export function isPlayableLevel(level: Pick<DeepTalkLevel, 'question_count'>): boolean {
  return (level.question_count ?? 0) > 0
}

/**
 * The level that must be finished before `levelNumber` opens: the nearest
 * earlier level that has questions. Empty "Segera Hadir" levels are skipped so
 * they never block the levels after them. Without `allLevels` it falls back to
 * levelNumber - 1. Returns null when nothing has to be finished first.
 */
export function getPrerequisiteLevel(levelNumber: number, allLevels?: DeepTalkLevel[]): number | null {
  if (!allLevels) return levelNumber > 1 ? levelNumber - 1 : null
  const earlier = allLevels
    .filter((l) => l.level_number < levelNumber && isPlayableLevel(l))
    .map((l) => l.level_number)
  return earlier.length > 0 ? Math.max(...earlier) : null
}

/** Cek apakah level boleh dimainkan berdasarkan completed_levels. */
export function isLevelUnlocked(levelNumber: number, completedLevels: number[], allLevels?: DeepTalkLevel[]): boolean {
  const prerequisite = getPrerequisiteLevel(levelNumber, allLevels)
  return prerequisite === null || completedLevels.includes(prerequisite)
}

/**
 * Status visual level. Prioritas:
 * 1. coming_soon (0 pertanyaan) — tidak playable
 * 2. premium_locked (free tier, level > 1) — pertanyaannya memang tidak bisa
 *    dibaca couple free (RLS), jadi replay pun tidak ditawarkan
 * 3. completed (ada di completed_levels)
 * 4. unlocked (level playable sebelumnya sudah completed)
 * 5. locked (default)
 *
 * `isPremium` default true agar pemanggil lama tidak berubah perilakunya.
 * Kirim `allLevels` supaya level kosong tidak mengunci level sesudahnya.
 * `openAll` (pack is_free): setiap level yang ada pertanyaannya langsung
 * terbuka — tanpa premium dan tanpa urutan.
 */
export function getLevelStatus(
  level: DeepTalkLevel,
  completedLevels: number[],
  isPremium = true,
  allLevels?: DeepTalkLevel[],
  openAll = false
): LevelStatus {
  if (!isPlayableLevel(level)) return 'coming_soon'
  if (openAll) return completedLevels.includes(level.level_number) ? 'completed' : 'unlocked'
  if (!isPremium && level.level_number > 1) return 'premium_locked'
  if (completedLevels.includes(level.level_number)) return 'completed'
  if (isLevelUnlocked(level.level_number, completedLevels, allLevels)) return 'unlocked'
  return 'locked'
}

/** True when every level that has questions is in completed_levels. */
export function isPackCompleted(levels: DeepTalkLevel[], completedLevels: number[]): boolean {
  const playable = levels.filter(isPlayableLevel)
  return playable.length > 0 && playable.every((l) => completedLevels.includes(l.level_number))
}

export async function getPacksWithProgress(coupleId: string) {
  const supabase = createClient()

  const [{ data: packs }, { data: progresses }, { data: levels }] = await Promise.all([
    supabase
      .from('deep_talk_packs')
      .select('*')
      .eq('is_published', true)
      .order('sort_order'),
    supabase
      .from('deep_talk_progress')
      .select('*')
      .eq('couple_id', coupleId),
    supabase
      .from('deep_talk_levels')
      .select('*')
      .order('level_number'),
  ])

  return {
    packs: (packs ?? []) as DeepTalkPack[],
    progresses: (progresses ?? []) as DeepTalkProgress[],
    levels: (levels ?? []) as DeepTalkLevel[],
  }
}

export async function getPackBySlug(slug: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('deep_talk_packs')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()
  return data as DeepTalkPack | null
}

export async function getLevelsForPack(packId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('deep_talk_levels')
    .select('*')
    .eq('pack_id', packId)
    .order('level_number')
  return (data ?? []) as DeepTalkLevel[]
}

export async function getQuestionsForLevel(levelId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('deep_talk_questions')
    .select('*')
    .eq('level_id', levelId)
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as DeepTalkQuestion[]
}

export async function getProgress(coupleId: string, packId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('deep_talk_progress')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('pack_id', packId)
    .maybeSingle()
  return data as DeepTalkProgress | null
}

/**
 * Saves the resume point (one per pack). Only touches level_number,
 * current_question_index and last_played_at, so completed_levels and
 * is_completed written by complete_deep_talk_level stay intact.
 */
export async function saveProgress(
  coupleId: string,
  packId: string,
  levelNumber: number,
  currentQuestionIndex: number
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('deep_talk_progress')
    .upsert(
      {
        couple_id: coupleId,
        pack_id: packId,
        level_number: levelNumber,
        current_question_index: currentQuestionIndex,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'couple_id,pack_id' }
    )
  if (error) throw new Error(error.message)
}

/**
 * Adds the level to completed_levels atomically (RPC complete_deep_talk_level,
 * which also recomputes is_completed for the pack).
 *
 * firstTime = true only the first time this couple completes the level, so a
 * replay never triggers the unlock celebration. Throws when the save fails.
 */
export async function markLevelCompleted(packId: string, levelNumber: number): Promise<{ firstTime: boolean }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('complete_deep_talk_level', {
    p_pack_id: packId,
    p_level_number: levelNumber,
  })
  if (error) throw new Error(error.message)
  return { firstTime: data === true }
}
