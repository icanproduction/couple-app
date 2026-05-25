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
