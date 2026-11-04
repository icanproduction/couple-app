'use client'

// The one overlay a visit may show: a new level (several levels merged into
// one), a new stage, or the pet coming all the way out of its box.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PetStage, PetType } from '@/types/pet'
import PetSvgCat from './PetSvgCat'
import PetSvgDog from './PetSvgDog'
import PetStyles from '@/components/pet/PetStyles'

interface Props {
  type: PetType
  stage: PetStage
  level: number
  initials: string
  title: string
  detail: string
  action: string
  onAction: () => void
  onClose: () => void
}

const CONFETTI = ['#F06B6B', '#E8C078', '#7EC4A0', '#8FA8E8', '#C49BE0']

export default function PetCelebration({ type, stage, level, initials, title, detail, action, onAction, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!mounted) return
    button.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])
  if (!mounted) return null
  const Pet = type === 'dog' ? PetSvgDog : PetSvgCat

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-label={title}>
      <PetStyles />
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="pet-anim relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface px-6 pb-6 pt-4 text-center shadow-elevated animate-scale-in">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40">
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className="pa-confetti absolute block h-2 w-1.5 rounded-sm"
              style={{ left: `${6 + i * 6.5}%`, top: 0, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 5) * 0.35}s` }}
            />
          ))}
        </div>
        <div className="mx-auto h-40 w-40">
          <Pet pose="celebrate" stage={stage} level={level} initials={initials} className="h-full w-full" />
        </div>
        <h2 className="mt-1 text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{detail}</p>
        <button
          ref={button}
          type="button"
          onClick={onAction}
          className="mt-5 w-full rounded-2xl bg-rose px-6 py-3.5 text-sm font-semibold text-white shadow-elevated transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/30 active:scale-[0.98]"
        >
          {action}
        </button>
      </div>
    </div>,
    document.body,
  )
}
