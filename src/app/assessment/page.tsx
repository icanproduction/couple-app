'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { questions, DIMENSION_LABELS } from '@/data/questions'
import { ArrowLeft, ChevronRight } from 'lucide-react'

type Answers = Record<number, number | string>

export default function AssessmentPage() {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [animating, setAnimating] = useState(false)

  const question = questions[currentIndex]
  const progress = ((currentIndex + 1) / questions.length) * 100

  function handleAnswer(value: number | string) {
    // A second tap during the slide animation would answer the same question twice.
    if (animating) return
    const newAnswers = { ...answers, [question.id]: value }
    setAnswers(newAnswers)

    if (currentIndex < questions.length - 1) {
      setAnimating(true)
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1)
        setAnimating(false)
      }, 250)
    } else {
      sessionStorage.setItem('assessment_answers', JSON.stringify(newAnswers))
      router.push('/results')
    }
  }

  const agreeOptions = [
    { value: 1, label: 'Sangat Tidak Setuju' },
    { value: 2, label: 'Tidak Setuju' },
    { value: 3, label: 'Netral' },
    { value: 4, label: 'Setuju' },
    { value: 5, label: 'Sangat Setuju' },
  ]

  const scaleLabels = ['Jarang', '', 'Kadang', '', 'Selalu']

  return (
    <div className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">
            {currentIndex + 1} dari {questions.length}
          </span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-dark">
            {DIMENSION_LABELS[question.dimension]}
          </span>
        </div>
        {/* Progress track */}
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-rose transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div
        className={`flex flex-1 flex-col justify-center transition-all duration-250 ${
          animating ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
        }`}
      >
        <h2 className="mb-10 text-xl font-semibold leading-relaxed text-ink text-balance">
          {question.text}
        </h2>

        {/* Agree / Disagree */}
        {question.type === 'agree_disagree' && (
          <div className="space-y-2.5">
            {agreeOptions.map((opt) => {
              const isSelected = answers[question.id] === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(opt.value)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-5 py-3.5 text-left text-sm font-medium transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-rose bg-rose-50 text-rose-dark shadow-card'
                      : 'border-border bg-surface text-ink-light hover:border-rose-light hover:bg-rose-50/50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Scale */}
        {question.type === 'scale' && (
          <div className="space-y-6">
            <div className="px-1">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={(answers[question.id] as number) ?? 3}
                onChange={(e) => {
                  const newAnswers = { ...answers, [question.id]: Number(e.target.value) }
                  setAnswers(newAnswers)
                }}
                className="w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-ink-muted">
                {scaleLabels.map((label, i) => (
                  <span key={i} className="w-10 text-center">{label}</span>
                ))}
              </div>
            </div>

            <div className="text-center">
              <span className="inline-block rounded-full bg-rose-50 px-4 py-1.5 text-lg font-bold text-rose-dark">
                {(answers[question.id] as number) ?? 3} / 5
              </span>
            </div>

            <button
              onClick={() => handleAnswer((answers[question.id] as number) ?? 3)}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-rose px-5 py-3.5 text-sm font-semibold text-white shadow-elevated transition-all hover:bg-rose-dark active:scale-[0.98]"
            >
              Lanjut
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {/* Priority */}
        {question.type === 'priority' && (
          <div className="space-y-2.5">
            {question.options?.map((opt) => {
              const isSelected = answers[question.id] === opt
              return (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left text-sm font-medium transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-rose bg-rose-50 text-rose-dark shadow-card'
                      : 'border-border bg-surface text-ink-light hover:border-rose-light hover:bg-rose-50/50'
                  }`}
                >
                  <span>{opt}</span>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Back button */}
      {currentIndex > 0 && (
        <button
          onClick={() => {
            setAnimating(true)
            setTimeout(() => {
              setCurrentIndex(currentIndex - 1)
              setAnimating(false)
            }, 200)
          }}
          className="mt-8 flex items-center justify-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali
        </button>
      )}
    </div>
  )
}
