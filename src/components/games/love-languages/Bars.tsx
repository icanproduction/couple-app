'use client'

import { useEffect, useState } from 'react'
import { Gift, HandHeart, HandHelping, Hourglass, MessageCircleHeart, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KEY_MAX, LOVE_KEYS, LOVE_LANGUAGES, rankKeys, type LoveKey, type LoveScores } from './bank'

const ICONS: Record<LoveKey, LucideIcon> = {
  words: MessageCircleHeart,
  time: Hourglass,
  gifts: Gift,
  acts: HandHelping,
  touch: HandHeart,
}

export function LoveIcon({ lang, size = 'md' }: { lang: LoveKey; size?: 'sm' | 'md' }) {
  const Icon = ICONS[lang]
  const info = LOVE_LANGUAGES[lang]
  return (
    <span
      className={cn('flex flex-shrink-0 items-center justify-center', size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl')}
      style={{ backgroundColor: info.soft, color: info.color }}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  )
}

function pct(score: number, grown: boolean): string {
  if (!grown) return '0%'
  return `${Math.round((Math.max(0, Math.min(KEY_MAX, score)) / KEY_MAX) * 100)}%`
}

/** False on the first frame, so the bars grow in from zero when a result appears. */
function useGrown(): boolean {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return grown
}

/** One person's five scores, highest first. */
export function ScoreBars({ scores }: { scores: LoveScores }) {
  const grown = useGrown()
  return (
    <ul className="space-y-3">
      {rankKeys(scores).map((key, i) => {
        const info = LOVE_LANGUAGES[key]
        return (
          <li key={key} className="flex items-center gap-3">
            <LoveIcon lang={key} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">
                  {info.name}
                  {i < 2 && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: info.color }}>Top {i + 1}</span>}
                </span>
                <span className="flex-shrink-0 text-xs font-bold tabular-nums text-ink-muted">
                  {scores[key]}<span className="font-medium">/{KEY_MAX}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border/60" aria-hidden>
                <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: pct(scores[key], grown), backgroundColor: info.color }} />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Both people side by side per language, ordered by how much the two of you care about it together. */
export function CompareBars({ mine, theirs, partnerName }: { mine: LoveScores; theirs: LoveScores; partnerName: string }) {
  const grown = useGrown()
  const order = [...LOVE_KEYS].sort((a, b) => (theirs[b] + mine[b]) - (theirs[a] + mine[a]) || LOVE_KEYS.indexOf(a) - LOVE_KEYS.indexOf(b))
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] font-semibold text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-ink-light" aria-hidden /> You</span>
        <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-4 flex-shrink-0 rounded-full bg-ink-light/40" aria-hidden /> <span className="truncate">{partnerName}</span></span>
      </div>
      <ul className="space-y-4">
        {order.map((key) => {
          const info = LOVE_LANGUAGES[key]
          return (
            <li key={key} className="flex gap-3">
              <LoveIcon lang={key} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{info.name}</p>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="sr-only">You:</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
                      <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: pct(mine[key], grown), backgroundColor: info.color }} />
                    </div>
                    <span className="w-5 text-right text-xs font-bold tabular-nums text-ink">{mine[key]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sr-only">{partnerName}:</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full border bg-white" style={{ borderColor: info.soft }} aria-hidden>
                      <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: pct(theirs[key], grown), backgroundColor: info.color, opacity: 0.4 }} />
                    </div>
                    <span className="w-5 text-right text-xs font-bold tabular-nums text-ink-muted">{theirs[key]}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[11px] text-ink-muted">Each score is out of {KEY_MAX}.</p>
    </div>
  )
}
