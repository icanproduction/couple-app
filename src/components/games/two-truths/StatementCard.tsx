'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Verdict = 'truth' | 'lie'

interface StatementCardProps {
  index: number
  text: string
  /** Pick mode renders a radio button; otherwise a plain card. */
  onSelect?: () => void
  selected?: boolean
  disabled?: boolean
  /** Waiting for the server: the picked card breathes, the others fade. */
  thinking?: boolean
  verdict?: Verdict | null
  /** The verdict stamp is on screen (false = still hidden, for the staggered reveal). */
  stamped?: boolean
  /** Small label on the card, e.g. "Your pick". */
  tag?: string | null
  /** The radio button, for arrow-key focus in pick mode. */
  buttonRef?: (el: HTMLButtonElement | null) => void
}

export default function StatementCard({
  index,
  text,
  onSelect,
  selected = false,
  disabled = false,
  thinking = false,
  verdict = null,
  stamped = true,
  tag = null,
  buttonRef,
}: StatementCardProps) {
  const shown = verdict !== null && stamped
  const isLie = shown && verdict === 'lie'
  const isTruth = shown && verdict === 'truth'

  const body = (
    <>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300',
          {
            'bg-rose text-white': (selected && !shown) || isLie,
            'bg-sage text-white': isTruth,
            'bg-cream text-ink-light': !selected && !shown,
          },
        )}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 pt-1">
        {tag && (
          <span className="mb-1 inline-block rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {tag}
          </span>
        )}
        <span
          className={cn('block break-words text-[15px] leading-snug text-ink transition-colors duration-300', {
            'text-ink-light': isTruth && !selected,
          })}
        >
          {text}
        </span>
      </span>
      {verdict !== null && (
        <span
          className={cn(
            'flex shrink-0 -rotate-6 items-center gap-1 self-center rounded-lg border-2 px-2 py-1 text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out motion-reduce:transition-none',
            {
              'scale-150 opacity-0': !stamped,
              'scale-100 opacity-100': stamped,
              'border-rose text-rose': verdict === 'lie',
              'border-sage-dark text-sage-dark': verdict === 'truth',
            },
          )}
          aria-hidden={!stamped}
        >
          {verdict === 'lie' ? <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
          {verdict === 'lie' ? 'Lie' : 'True'}
        </span>
      )}
    </>
  )

  const frame = cn(
    'flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-card transition-all duration-300 motion-reduce:transition-none',
    {
      'border-rose ring-2 ring-rose/20': selected && !shown,
      'border-rose bg-rose-50 ring-2 ring-rose/20': isLie,
      'border-sage/60 bg-sage/5': isTruth,
      'border-border': !selected && !shown,
      'animate-pulse': thinking && selected,
      'opacity-50': thinking && !selected,
    },
  )

  if (onSelect) {
    return (
      <button
        ref={buttonRef}
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className={cn(frame, 'active:scale-[0.99] disabled:cursor-default', { 'hover:border-rose/40': !selected && !disabled })}
      >
        {body}
      </button>
    )
  }
  return <div className={frame}>{body}</div>
}
