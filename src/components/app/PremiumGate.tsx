'use client'

import { useState } from 'react'
import { Sparkles, Check } from 'lucide-react'

interface PremiumGateProps {
  /** Heading for the paywall card */
  title?: string
  /** Short line under the heading */
  subtitle?: string
  /** Bullet list of what unlock includes */
  perks?: string[]
  /** Called after a successful unlock so the parent can refresh its state */
  onUnlocked?: () => void
}

/**
 * Paywall card with a dummy-payment "Unlock" button.
 * Posts /api/unlock; on success calls onUnlocked().
 */
export function PremiumGate({
  title = 'Get Premium',
  subtitle = 'Pay once and it covers both of you, for good.',
  perks = [
    'Every Deep Talk level',
    'Full assessment results and areas to grow',
    'A results card you can share',
  ],
  onUnlocked,
}: PremiumGateProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUnlock() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/unlock', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Couldn't turn on Premium. Try again.")
      onUnlocked?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on Premium. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-rose/20 bg-gradient-to-br from-rose/5 to-amber-50 p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose/10">
          <Sparkles className="h-4.5 w-4.5 text-rose" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">{subtitle}</p>
        </div>
      </div>

      <ul className="mb-4 space-y-1.5">
        {perks.map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-xs text-ink-light">
            <Check className="h-3.5 w-3.5 shrink-0 text-sage" strokeWidth={2} />
            {perk}
          </li>
        ))}
      </ul>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <button
        onClick={handleUnlock}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose py-3 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Get Premium
          </>
        )}
      </button>
    </div>
  )
}
