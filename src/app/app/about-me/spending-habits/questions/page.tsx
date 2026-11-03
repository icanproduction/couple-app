'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { SPENDING_QUESTIONS } from '@/lib/spending-assessment/questions'
import { calculateSpendingType } from '@/lib/spending-assessment/calculate'
import type { SpendingAnswer } from '@/lib/spending-assessment/types'

const STORAGE_KEY = 'nantikita_spending_answers'

export default function SpendingQuestionsPage() {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, SpendingAnswer>>({})
  const [animating, setAnimating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // Ignore taps while sliding to the next question / while saving — a double
  // tap used to skip a question or run past the last one (crash).
  const busyRef = useRef(false)

  const lastIndex = SPENDING_QUESTIONS.length - 1
  const qIndex = Math.min(Math.max(current, 0), lastIndex)
  const question = SPENDING_QUESTIONS[qIndex]
  const progress = ((qIndex + 1) / SPENDING_QUESTIONS.length) * 100

  // Restore from localStorage (clamped: the saved index may be stale)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      setAnswers(parsed.answers ?? {})
      const idx = Number(parsed.current)
      setCurrent(Number.isInteger(idx) ? Math.min(Math.max(idx, 0), SPENDING_QUESTIONS.length - 1) : 0)
    } catch { /* ignore */ }
  }, [])

  // Save to localStorage on change
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, current: qIndex })) } catch { /* ignore */ }
    }
  }, [answers, qIndex])

  async function handleAnswer(key: SpendingAnswer) {
    if (busyRef.current) return
    busyRef.current = true
    const newAnswers = { ...answers, [`q${question.id}`]: key }
    setAnswers(newAnswers)

    if (qIndex < lastIndex) {
      setAnimating(true)
      setTimeout(() => {
        setCurrent(c => Math.min(c + 1, lastIndex))
        setAnimating(false)
        busyRef.current = false
      }, 250)
      return
    }

    // Last question — calculate and save
    const saved = await submit(newAnswers)
    if (!saved) busyRef.current = false
  }

  /** Saves the result; on failure keeps the answers (state + localStorage) for a retry */
  async function submit(newAnswers: Record<string, SpendingAnswer>): Promise<boolean> {
    setSubmitting(true)
    setSubmitError('')
    const result = calculateSpendingType(newAnswers)

    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return false }

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()

    if (!membership?.couple_id) {
      setSubmitError('Connect with your partner first so your result can be saved.')
      setSubmitting(false)
      return false
    }

    {
      const { error } = await supabase.from('spending_results').upsert({
        couple_id: membership.couple_id,
        profile_id: user.id,
        spending_type: result.spendingType,
        scores: result.scores,
        answers: newAnswers,
      }, { onConflict: 'couple_id,profile_id' })

      if (error) {
        setSubmitError("Your result wasn't saved. Your answers are still here, so try again.")
        setSubmitting(false)
        return false
      }
    }

    // Notify partner
    const { data: partnerMembers } = await supabase
      .from('couple_members').select('profile_id')
      .eq('couple_id', membership.couple_id).neq('profile_id', user.id)

    const { data: myProfile } = await supabase
      .from('profiles').select('name').eq('id', user.id).maybeSingle()

    if (partnerMembers?.[0]) {
      try {
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: partnerMembers[0].profile_id,
            title: 'Nanti Kita',
            body: `${myProfile?.name ?? 'Your partner'} finished the Spending Habits test. Take it too and compare.`,
            url: '/app/about-me/spending-habits',
            kind: 'activity',
          }),
        })
      } catch { /* optional */ }
    }

    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    router.push('/app/about-me/spending-habits/result')
    return true
  }

  function goBack() {
    if (busyRef.current || qIndex === 0) return
    busyRef.current = true
    setAnimating(true)
    setTimeout(() => {
      setCurrent(c => Math.max(c - 1, 0))
      setAnimating(false)
      busyRef.current = false
    }, 200)
  }

  if (submitting) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-amber-200 border-t-amber-600" />
        <p className="mt-4 text-sm text-ink-muted">Reading your spending pattern...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">{qIndex + 1} of {SPENDING_QUESTIONS.length}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Spending Habits</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question */}
      <div className={`flex flex-1 flex-col justify-center transition-all duration-250 ${
        animating ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
      }`}>
        <h2 className="mb-8 text-xl font-semibold leading-relaxed text-ink text-balance">
          {question.question}
        </h2>

        <div className="space-y-2.5">
          {question.options.map(opt => {
            const isSelected = answers[`q${question.id}`] === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => handleAnswer(opt.key)}
                className={`flex w-full items-center justify-between rounded-2xl border px-5 py-3.5 text-left text-sm font-medium transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-card'
                    : 'border-border bg-white text-ink-muted hover:border-amber-200 hover:bg-amber-50/50'
                }`}
              >
                <span>{opt.text}</span>
                {isSelected && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Save failed: answers are kept, retry from here */}
      {submitError && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-600">{submitError}</p>
          <button
            onClick={async () => {
              if (busyRef.current) return
              busyRef.current = true
              const ok = await submit(answers)
              if (!ok) busyRef.current = false
            }}
            className="mt-2 text-sm font-bold text-rose underline"
          >
            Try saving again
          </button>
        </div>
      )}

      {/* Back */}
      {qIndex > 0 && (
        <button
          onClick={goBack}
          className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}
    </div>
  )
}
