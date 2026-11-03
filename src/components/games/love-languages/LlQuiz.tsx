'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, CloudOff, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FullScreen } from './FullScreen'
import { LOVE_PAIRS, QUESTION_COUNT } from './bank'

/** How long the picked option stays highlighted before the next pair slides in. */
const ADVANCE_MS = 280

interface Props {
  onClose: () => void
  /** Saves the full set of answers; throws when the save fails. */
  onSave: (answers: number[]) => Promise<void>
}

export function LlQuiz({ onClose, onSave }: Props) {
  const [answers, setAnswers] = useState<number[]>([])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [phase, setPhase] = useState<'asking' | 'saving' | 'error'>('asking')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const save = useCallback(async (all: number[]) => {
    if (busy.current) return
    busy.current = true
    setPhase('saving')
    try {
      await onSave(all)
    } catch {
      setPhase('error')
    } finally {
      busy.current = false
    }
  }, [onSave])

  function choose(option: 0 | 1) {
    if (picked !== null || phase !== 'asking') return
    setPicked(option)
    const next = [...answers.slice(0, index), option, ...answers.slice(index + 1)]
    setAnswers(next)
    advanceTimer.current = setTimeout(() => {
      setPicked(null)
      if (index + 1 >= QUESTION_COUNT) {
        if (next.length === QUESTION_COUNT) void save(next)
        return
      }
      setIndex(index + 1)
    }, ADVANCE_MS)
  }

  function back() {
    if (picked !== null || index === 0) return
    setIndex(index - 1)
  }

  const requestClose = useCallback(() => {
    if (phase === 'saving') return
    if (answers.length > 0 && phase === 'asking') setConfirmLeave(true)
    else onClose()
  }, [answers.length, phase, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmLeave) setConfirmLeave(false)
      else requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmLeave, requestClose])

  const pair = LOVE_PAIRS[index]
  const answeredHere = answers[index]
  const progress = ((index + (picked !== null ? 1 : 0)) / QUESTION_COUNT) * 100

  return (
    <FullScreen label="Love Languages quiz">
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),1rem)]">
        <button
          type="button"
          onClick={requestClose}
          disabled={phase === 'saving'}
          aria-label="Close the quiz"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-40"
        >
          <X className="h-4 w-4 text-ink" />
        </button>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={0}
          aria-valuemax={QUESTION_COUNT}
          aria-valuenow={Math.min(QUESTION_COUNT, index + (picked !== null ? 1 : 0))}
        >
          <div className="h-full rounded-full bg-rose transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <span className="w-12 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-ink-muted">
          {index + 1}/{QUESTION_COUNT}
        </span>
      </div>

      {phase === 'asking' ? (
        <>
          <div className="flex flex-1 flex-col justify-center px-5 py-6">
            <p className="text-center text-sm font-semibold text-ink-muted">Which would feel more like love?</p>
            <div key={index} className="mt-5 space-y-3 motion-safe:animate-slide-up">
              {pair.map((option, i) => {
                const isPicked = picked === i || (picked === null && answeredHere === i)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => choose(i as 0 | 1)}
                    aria-pressed={answeredHere === i}
                    className={cn(
                      'relative flex min-h-[112px] w-full items-center rounded-3xl border-2 bg-white px-5 py-5 text-left shadow-card transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
                      isPicked ? 'border-rose shadow-elevated' : 'border-transparent',
                      { 'opacity-50': picked !== null && picked !== i },
                    )}
                  >
                    <span className="pr-8 text-lg font-semibold leading-snug text-ink">{option.text}</span>
                    {isPicked && (
                      <span className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-rose text-white motion-safe:animate-scale-in">
                        <Check className="h-4 w-4" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-center text-xs text-ink-muted">No wrong answers. Go with your gut.</p>
          </div>
          <div className="flex items-center px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
            <button
              type="button"
              onClick={back}
              disabled={index === 0 || picked !== null}
              className="flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-semibold text-ink-light transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          </div>
        </>
      ) : phase === 'saving' ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center" role="status">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" aria-hidden />
          <p className="mt-4 text-sm font-semibold text-ink">Adding up your answers...</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center" role="alert">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose">
            <CloudOff className="h-6 w-6" />
          </div>
          <p className="mt-4 text-base font-bold text-ink">Couldn&apos;t save your answers</p>
          <p className="mt-1 text-sm text-ink-muted">Check your connection and try again. Your answers are still here.</p>
          <button
            type="button"
            onClick={() => { if (answers.length === QUESTION_COUNT) void save(answers) }}
            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-rose text-sm font-bold text-white shadow-elevated active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <button type="button" onClick={onClose} className="mt-3 min-h-[44px] px-4 text-sm font-semibold text-ink-muted">
            Leave without saving
          </button>
        </div>
      )}

      {confirmLeave && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm motion-safe:animate-fade-in" onClick={() => setConfirmLeave(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ll-leave-title"
            className="w-full max-w-lg rounded-t-3xl bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 text-center motion-safe:animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="ll-leave-title" className="text-lg font-bold text-ink">Leave the quiz?</p>
            <p className="mt-1 text-sm text-ink-muted">Your answers so far won&apos;t be saved.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="min-h-[48px] rounded-2xl bg-rose text-sm font-bold text-white shadow-elevated active:scale-[0.98]"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] rounded-2xl border border-border text-sm font-semibold text-ink-light active:scale-[0.98]"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </FullScreen>
  )
}
