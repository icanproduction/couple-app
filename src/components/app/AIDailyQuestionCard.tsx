'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, Wand2, Loader2, RefreshCw } from 'lucide-react'

interface AIDailyQuestionCardProps {
  coupleId: string | null
}

interface DailyQuestionResponse {
  question?: string | null
  pending?: boolean
  error?: string
}

const POLL_MS = 5000
const MAX_POLLS = 12

export default function AIDailyQuestionCard({ coupleId }: AIDailyQuestionCardProps) {
  const [question, setQuestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  // Today's row exists but `question` is still null: someone is generating it
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/daily-question')
      const data: DailyQuestionResponse = await res.json()
      if (data.question) {
        setQuestion(data.question)
        setPending(false)
      } else {
        // null question = "belum ada" (or still being generated)
        setPending(!!data.pending)
      }
    } catch { /* keep current state */ }
  }, [])

  // Check if today's AI question already exists
  useEffect(() => {
    if (!coupleId) return
    check().finally(() => setChecked(true))
  }, [coupleId, check])

  // While the partner's request is generating, poll for a little while
  useEffect(() => {
    if (!pending || question) return
    polls.current = 0
    const t = setInterval(() => {
      polls.current += 1
      if (polls.current > MAX_POLLS) { clearInterval(t); return }
      check()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [pending, question, check])

  async function generate() {
    if (loading || question) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/daily-question', { method: 'POST' })
      const data: DailyQuestionResponse = await res.json()
      if (data.question) {
        setQuestion(data.question)
        setPending(false)
      } else if (data.pending) {
        setPending(true)
      } else {
        setError(data.error ?? 'Gagal generate, tap untuk coba lagi')
      }
    } catch {
      setError('Gagal generate, tap untuk coba lagi')
    }
    setLoading(false)
  }

  if (!coupleId || !checked) return null

  // Already has today's AI question — show it
  if (question) {
    return (
      <div className="mx-6 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-rose-50 p-4 shadow-card overflow-hidden">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-100">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" strokeWidth={2} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-500">
            AI Question
          </span>
          <span className="ml-auto text-[10px] text-purple-400">personalized</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-ink">
          {question}
        </p>
      </div>
    )
  }

  const busy = loading || pending

  // No question yet — show generate button
  return (
    <div className="mx-6">
      <button
        onClick={generate}
        disabled={loading}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-purple-300 bg-gradient-to-r from-purple-50/50 to-rose-50/50 p-4 text-left transition-all hover:border-purple-400 hover:shadow-card active:scale-[0.98] disabled:opacity-60"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
          ) : error ? (
            <RefreshCw className="h-5 w-5 text-purple-500" />
          ) : (
            <Wand2 className="h-5 w-5 text-purple-600" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">
            {loading ? 'Generating...' : pending ? 'Sedang dibuat...' : error ? 'Coba lagi' : 'AI Question Hari Ini'}
          </p>
          <p className="text-xs text-ink-muted">
            {loading
              ? 'AI sedang buat pertanyaan khusus buat kalian'
              : pending
              ? 'Pertanyaan hari ini sedang disiapkan, tunggu sebentar ya'
              : error
              ? error
              : 'Tap untuk generate pertanyaan personal dari AI'
            }
          </p>
        </div>
        {!busy && (
          <Sparkles className="h-4 w-4 flex-shrink-0 text-purple-400" />
        )}
      </button>
    </div>
  )
}
