'use client'

import { useRouter } from 'next/navigation'
import { Heart, Sparkles, Wallet, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const FEATURES = [
  { icon: Sparkles, text: 'A relationship readiness check', color: 'text-rose' },
  { icon: Wallet, text: 'Shared savings and a wishlist', color: 'text-yellow-600' },
  { icon: CalendarDays, text: 'A calendar for your big dates', color: 'text-sage-dark' },
]

export default function OnboardingWelcomePage() {
  const router = useRouter()

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center animate-fade-in">
      {/* Heart animation */}
      <div className="relative mb-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-rose/10">
          <Heart
            className="h-12 w-12 text-rose animate-pulse"
            strokeWidth={1.5}
            fill="currentColor"
            fillOpacity={0.2}
          />
        </div>
        {/* Sparkle dots */}
        <div className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-gold" />
        <div className="absolute -bottom-1 -left-2 h-2 w-2 animate-ping rounded-full bg-sage delay-300" />
      </div>

      <h1 className="mb-2 text-3xl font-extrabold text-ink">
        Welcome to Nanti Kita
      </h1>
      <p className="mb-8 max-w-xs text-sm leading-relaxed text-ink-muted">
        Nanti Kita helps you and your partner plan your future
        together, from your relationship and your money to the
        days you want to celebrate.
      </p>

      {/* Feature pills */}
      <div className="mb-10 space-y-2.5">
        {FEATURES.map(f => (
          <div
            key={f.text}
            className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-card"
          >
            <f.icon className={`h-4 w-4 ${f.color}`} strokeWidth={2} />
            <span className="text-sm font-medium text-ink">{f.text}</span>
          </div>
        ))}
      </div>

      <Button onClick={() => router.push('/onboarding/profile')} size="lg">
        <span className="flex items-center gap-2">
          Let&apos;s start
          <Heart className="h-4 w-4" fill="currentColor" fillOpacity={0.3} />
        </span>
      </Button>
    </div>
  )
}
