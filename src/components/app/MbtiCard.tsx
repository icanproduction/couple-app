'use client'

import { Brain, ChevronRight } from 'lucide-react'
import { getMbtiDescription } from '@/data/mbtiDescriptions'
import type { MbtiScores } from '@/data/mbtiQuestions'

interface MbtiCardProps {
  mbtiType: string
  scores: MbtiScores
  takenAt?: string
  showLink?: boolean
  linkHref?: string
}

function DichotomyBar({ left, right, leftVal, rightVal }: {
  left: string; right: string; leftVal: number; rightVal: number
}) {
  const total = leftVal + rightVal
  const leftPct = total > 0 ? Math.round((leftVal / total) * 100) : 50
  return (
    <div className="flex items-center gap-2">
      <span className={`w-5 text-center text-xs font-bold ${leftPct >= 50 ? 'text-rose' : 'text-ink-muted/40'}`}>{left}</span>
      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-cream">
        <div className="h-full rounded-full bg-gradient-to-r from-rose to-rose-dark transition-all" style={{ width: `${leftPct}%` }} />
      </div>
      <span className={`w-5 text-center text-xs font-bold ${leftPct < 50 ? 'text-sage-dark' : 'text-ink-muted/40'}`}>{right}</span>
    </div>
  )
}

export default function MbtiCard({ mbtiType, scores, showLink, linkHref }: MbtiCardProps) {
  const info = getMbtiDescription(mbtiType)
  if (!info) return null

  return (
    <div className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-rose-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-2xl">
              {info.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-purple-600 px-2.5 py-0.5 text-sm font-extrabold tracking-wider text-white">
                  {mbtiType}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-ink">{info.title}</p>
            </div>
          </div>
          <Brain className="h-5 w-5 text-purple-300" />
        </div>
      </div>

      {/* Description */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs leading-relaxed text-ink-muted">{info.description}</p>
      </div>

      {/* Dichotomy bars */}
      <div className="space-y-2 px-4 pb-3">
        <DichotomyBar left="E" right="I" leftVal={scores.E} rightVal={scores.I} />
        <DichotomyBar left="S" right="N" leftVal={scores.S} rightVal={scores.N} />
        <DichotomyBar left="T" right="F" leftVal={scores.T} rightVal={scores.F} />
        <DichotomyBar left="J" right="P" leftVal={scores.J} rightVal={scores.P} />
      </div>

      {/* Strengths */}
      <div className="border-t border-border px-4 py-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/60">Strengths</p>
        <div className="flex flex-wrap gap-1.5">
          {info.strengths.map(s => (
            <span key={s} className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-600">{s}</span>
          ))}
        </div>
      </div>

      {/* Love style */}
      <div className="border-t border-border px-4 py-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/60">Love style</p>
        <p className="text-xs text-ink-muted">{info.loveStyle}</p>
      </div>

      {/* Link */}
      {showLink && linkHref && (
        <a href={linkHref}
          className="flex items-center justify-center gap-1 border-t border-border py-2.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
          Retake MBTI <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
