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

export type LevelStatus = 'coming_soon' | 'locked' | 'unlocked' | 'completed'

/**
 * Cek apakah level boleh dimainkan berdasarkan completed_levels.
 * L1 selalu unlocked. L2+ butuh level sebelumnya ada di completed_levels.
 */
export function isLevelUnlocked(levelNumber: number, completedLevels: number[]): boolean {
  if (levelNumber === 1) return true
  return completedLevels.includes(levelNumber - 1)
}

/**
 * Status visual level. Prioritas:
 * 1. coming_soon (0 pertanyaan) — selalu menang, tidak playable
 * 2. completed (ada di completed_levels)
 * 3. unlocked (level sebelumnya completed)
 * 4. locked (default)
 */
export function getLevelStatus(
  level: DeepTalkLevel,
  completedLevels: number[]
): LevelStatus {
  if ((level.question_count ?? 0) === 0) return 'coming_soon'
  if (completedLevels.includes(level.level_number)) return 'completed'
  if (isLevelUnlocked(level.level_number, completedLevels)) return 'unlocked'
  return 'locked'
}

export async function getPacksWithProgress(coupleId: string) {
  const supabase = createClient()

  const [{ data: packs }, { data: progresses }] = await Promise.all([
    supabase
      .from('deep_talk_packs')
      .select('*')
      .eq('is_published', true)
      .order('sort_order'),
    supabase
      .from('deep_talk_progress')
      .select('*')
      .eq('couple_id', coupleId),
  ])

  return {
    packs: (packs ?? []) as DeepTalkPack[],
    progresses: (progresses ?? []) as DeepTalkProgress[],
  }
}

export async function getPackBySlug(slug: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('deep_talk_packs')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()
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

export async function saveProgress(
  coupleId: string,
  packId: string,
  levelNumber: number,
  currentQuestionIndex: number,
  isCompleted = false
) {
  const supabase = createClient()
  await supabase
    .from('deep_talk_progress')
    .upsert(
      {
        couple_id: coupleId,
        pack_id: packId,
        level_number: levelNumber,
        current_question_index: currentQuestionIndex,
        is_completed: isCompleted,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'couple_id,pack_id' }
    )
}

/**
 * Mark a level as completed in completed_levels[]. Re-fetches existing progress
 * to merge (handles race when partner also completes simultaneously).
 *
 * Returns unlockedNext = true hanya jika level ini BARU pertama kali completed
 * (bukan replay). Caller pakai flag ini untuk decide apakah show celebration.
 */
export async function markLevelCompleted(
  coupleId: string,
  packId: string,
  levelNumber: number,
  totalQuestions: number
): Promise<{ unlockedNext: boolean }> {
  const supabase = createClient()

  // Re-fetch existing untuk merge (race-safe)
  const existing = await getProgress(coupleId, packId)
  const completed = new Set(existing?.completed_levels ?? [])
  const wasNew = !completed.has(levelNumber)
  completed.add(levelNumber)

  await supabase.from('deep_talk_progress').upsert(
    {
      couple_id: coupleId,
      pack_id: packId,
      level_number: levelNumber,
      current_question_index: totalQuestions,
      completed_levels: Array.from(completed).sort((a, b) => a - b),
      is_completed: existing?.is_completed ?? false,
      last_played_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,pack_id' }
  )

  return { unlockedNext: wasNew }
}
