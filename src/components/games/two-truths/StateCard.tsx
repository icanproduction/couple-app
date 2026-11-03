'use client'

import Link from 'next/link'
import { RefreshCw, UserPlus, WifiOff, type LucideIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

interface StateCardProps {
  icon: LucideIcon
  title: string
  body?: string
  /** Buttons or links under the text. */
  children?: React.ReactNode
  tone?: 'neutral' | 'warn'
  role?: 'alert' | 'status'
}

/** Empty, error and partner-missing screens share this card. */
export function StateCard({ icon: Icon, title, body, children, tone = 'neutral', role }: StateCardProps) {
  return (
    <div role={role} className="mx-6 mt-6 rounded-2xl border border-border bg-white p-6 text-center shadow-card animate-fade-in">
      <div
        className={cn('mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl', {
          'bg-sky-50 text-sky-600': tone === 'neutral',
          'bg-rose-50 text-rose': tone === 'warn',
        })}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {body && <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-muted">{body}</p>}
      {children && <div className="mt-5 space-y-2">{children}</div>}
    </div>
  )
}

/** No couple yet, or the partner hasn't joined: nobody to play with. */
export function NoPartnerCard() {
  return (
    <StateCard
      icon={UserPlus}
      title="This game needs two"
      body="Invite your partner to Nanti Kita. Once they join, you can send each other rounds."
    >
      <Link href="/onboarding/invite" className={buttonVariants()}>
        Invite your partner
      </Link>
    </StateCard>
  )
}

/** A first load that failed. */
export function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateCard icon={WifiOff} tone="warn" role="alert" title="Couldn't load the game" body={message}>
      <Button onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
      </Button>
    </StateCard>
  )
}

/** Placeholder while the game loads: header-height blocks, no layout jump. */
export function GameSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <Skeleton className="mb-3 h-4 w-16" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-3 px-6 pt-6">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
