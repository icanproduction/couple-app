'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Play, CheckCircle2 } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { getPacksWithProgress, isPackCompleted, isPlayableLevel } from '@/lib/deep-talk'
import type { DeepTalkLevel, DeepTalkPack, DeepTalkProgress } from '@/lib/deep-talk'
import DeepTalkPackIcon from '@/components/game/DeepTalkPackIcon'

const DEFAULT_COLOR = '#E07A9E'
/** Pack colors are "#RRGGBB" from the admin palette; anything else falls back. */
function packColor(color: string | null): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR
}

export default function DeepTalkHubPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [packs, setPacks] = useState<DeepTalkPack[]>([])
  const [progresses, setProgresses] = useState<DeepTalkProgress[]>([])
  const [levels, setLevels] = useState<DeepTalkLevel[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) {
      setLoading(false)
      router.replace('/auth/login')
      return
    }

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) { setLoading(false); return }
    setCoupleId(membership.couple_id)

    const { packs: p, progresses: pr, levels: lv } = await getPacksWithProgress(membership.couple_id)
    setPacks(p)
    setProgresses(pr)
    setLevels(lv)
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadData().catch((err) => {
      console.error('[deep-talk] failed to load the pack list:', err)
      setLoading(false)
    })
  }, [loadData])

  function getProgress(packId: string) {
    return progresses.find(p => p.pack_id === packId) ?? null
  }

  /** Completion is derived from completed_levels, not a stored flag. */
  function getPackState(packId: string, progress: DeepTalkProgress | null) {
    const packLevels = levels.filter(l => l.pack_id === packId)
    const completed = progress?.completed_levels ?? []
    if (isPackCompleted(packLevels, completed)) return { done: true, label: 'Done' }
    if (!progress) return { done: false, label: null }

    const resumeLevel = packLevels.find(l => l.level_number === progress.level_number)
    if (!completed.includes(progress.level_number) && progress.current_question_index > 0) {
      const total = resumeLevel?.question_count
      const position = total ? `${progress.current_question_index}/${total}` : `${progress.current_question_index}`
      return { done: false, label: `Level ${progress.level_number} · ${position} done` }
    }
    if (completed.length > 0) {
      const playable = packLevels.filter(isPlayableLevel).length
      const unit = (playable || completed.length) === 1 ? 'level' : 'levels'
      return { done: false, label: `${completed.length}${playable ? `/${playable}` : ''} ${unit} done` }
    }
    return { done: false, label: null }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  return (
    <div className="animate-fade-in pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <button onClick={() => router.push('/app/games')} className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Games
        </button>
        <h1 className="text-xl font-bold text-ink">Deep Talk</h1>
        <p className="text-sm text-ink-muted">Questions for getting to know each other</p>
      </div>

      <div className="space-y-3 px-6 pt-5">
        {packs.map(pack => {
          const progress = getProgress(pack.id)
          const { done: isCompleted, label: progressLabel } = getPackState(pack.id, progress)
          const color = packColor(pack.color)
          const packLevels = levels.filter(l => l.pack_id === pack.id && isPlayableLevel(l))
          const questionTotal = packLevels.reduce((sum, l) => sum + (l.question_count ?? 0), 0)

          return (
            <button
              key={pack.id}
              onClick={() => router.push(`/app/games/deep-talk/${pack.slug}`)}
              className="flex w-full items-center gap-4 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition-all hover:border-rose/30 active:scale-[0.99]"
            >
              <div
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
              >
                <DeepTalkPackIcon name={pack.icon_name} className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-ink">{pack.title}</p>
                  {isCompleted && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-sage" />}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted line-clamp-1">{pack.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {progressLabel ? (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${isCompleted ? 'bg-sage/10 text-sage-dark' : 'text-ink-muted'}`}
                      style={isCompleted ? undefined : { background: `${color}1f` }}
                    >
                      {progressLabel}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-ink-muted" style={{ background: `${color}1f` }}>
                      {packLevels.length} {packLevels.length === 1 ? 'level' : 'levels'} · {questionTotal} {questionTotal === 1 ? 'question' : 'questions'}
                    </span>
                  )}
                  {pack.is_free && (
                    <span className="inline-block rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-bold text-sage-dark">
                      All open
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
            </button>
          )
        })}

        {!coupleId && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-ink-muted">Connect with your partner first to start</p>
          </div>
        )}
      </div>

      <div className="mx-6 mt-5 rounded-2xl bg-rose/5 border border-rose/20 p-4">
        <div className="flex items-start gap-3">
          <Play className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose" />
          <div>
            <p className="text-xs font-semibold text-ink">How to play</p>
            <p className="mt-1 text-xs text-ink-muted">Open it together, take turns reading the questions out loud, and answer honestly. No rush, no wrong answers.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
