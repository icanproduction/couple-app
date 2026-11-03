'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Zap, Trophy, Clock } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { CHAPTERS } from '@/data/samakan'
import { getGameHistory } from '@/lib/samakan'
import type { GameSession } from '@/types/samakan'

export default function SinkronisasiHubPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [partnerName, setPartnerName] = useState<string>('your partner')
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [history, setHistory] = useState<GameSession[]>([])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const supabase = createClient()
      const user = await getClientUser()
      if (cancelled) return
      if (!user) {
        setLoading(false)
        router.replace('/auth/login')
        return
      }

      const { data: membership } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (!membership?.couple_id) { setLoading(false); return }

      // Get partner name
      const { data: partners } = await supabase
        .from('couple_members')
        .select('profile_id')
        .eq('couple_id', membership.couple_id)
        .neq('profile_id', user.id)

      if (partners?.[0]) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', partners[0].profile_id)
          .single()
        if (profile?.name) setPartnerName(profile.name)
      }

      // Load history
      const games = await getGameHistory(membership.couple_id)
      if (cancelled) return
      setHistory(games)
      setLoading(false)
    }
    init().catch((err) => {
      console.error('[samakan] failed to load the hub:', err)
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!createError) return
    const t = setTimeout(() => setCreateError(null), 6000)
    return () => clearTimeout(t)
  }, [createError])

  const handlePlay = async (chapterId: string) => {
    if (creating) return
    setCreating(chapterId)
    setCreateError(null)
    try {
      const res = await fetch('/api/games/samakan/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sessionId) {
        router.push(`/app/games/samakan/${data.sessionId}`)
        return
      }
      setCreateError(data.error ?? "Couldn't start the game. Try again.")
    } catch (err) {
      console.error('Failed to create session:', err)
      setCreateError("Couldn't connect. Check your internet and try again.")
    } finally {
      setCreating(null)
    }
  }

  const getChapterTitle = (id: string) =>
    CHAPTERS.find((c) => c.id === id)?.title ?? id

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-24">
      {/* Header */}
      <div className="border-b border-border bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/app/games')} className="rounded-full p-1 -ml-1 hover:bg-cream">
            <ArrowLeft className="h-5 w-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-500" />
              <h1 className="text-xl font-bold text-ink">Samakan</h1>
            </div>
            <p className="text-sm text-ink-muted">Match answers with {partnerName} in real time</p>
          </div>
        </div>
      </div>

      {/* Chapter select */}
      <div className="px-6 pt-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
          Pick a chapter
        </p>
        {createError && (
          <div role="alert" className="mb-3 rounded-xl border border-rose/20 bg-rose/5 px-4 py-3 text-xs font-medium text-rose animate-fade-in">
            {createError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {CHAPTERS.map((chapter) => (
            <div
              key={chapter.id}
              className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card"
            >
              <div className={`h-2 bg-gradient-to-r ${chapter.gradient}`} />
              {/* Column layout + mt-auto keeps every "Play together" on the same line,
                  whether the title takes one line or two. */}
              <div className="flex flex-1 flex-col p-4">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-ink">{chapter.title}</h3>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed line-clamp-2">
                    {chapter.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => handlePlay(chapter.id)}
                  disabled={!!creating}
                  className={`mt-3 w-full rounded-lg py-2 text-xs font-bold transition-all ${
                    creating === chapter.id
                      ? 'bg-purple-100 text-purple-400'
                      : 'bg-purple-50 text-purple-600 active:scale-95 hover:bg-purple-100'
                  }`}
                >
                  {creating === chapter.id ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    'Play together'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="px-6 pt-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
            Past games
          </p>
          <div className="space-y-2">
            {history.map((game) => {
              const maxScore = (game.rounds?.length ?? 5) * 20
              const pct = maxScore > 0 ? Math.round((game.total_score / maxScore) * 100) : 0
              return (
                <div
                  key={game.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                      <Trophy className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {getChapterTitle(game.chapter_id)}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-ink-muted">
                        <Clock className="h-3 w-3" />
                        {game.completed_at
                          ? new Date(game.completed_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })
                          : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-lg font-bold ${
                        pct >= 80
                          ? 'text-emerald-500'
                          : pct >= 50
                          ? 'text-amber-500'
                          : 'text-red-400'
                      }`}
                    >
                      {pct}%
                    </span>
                    <p className="text-xs text-ink-muted">
                      {game.total_score}/{maxScore}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
