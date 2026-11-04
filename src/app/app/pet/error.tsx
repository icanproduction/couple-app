'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { PawPrint, RotateCcw } from 'lucide-react'

export default function PetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[pet error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center animate-fade-in">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sage/15">
        <PawPrint className="h-8 w-8 text-sage-dark" />
      </div>
      <h1 className="text-xl font-bold text-ink">Pet Kita didn&apos;t load</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
        Your pet is fine, nothing was lost. Check your connection and try again.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-2xl bg-rose px-6 py-3.5 text-sm font-semibold text-white shadow-elevated active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link href="/app/home" className="rounded-2xl border border-border bg-white px-6 py-3.5 text-sm font-semibold text-ink-light">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
