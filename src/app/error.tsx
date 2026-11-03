'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { HeartCrack, RotateCcw } from 'lucide-react'

// Catches render/runtime errors anywhere below the root layout so a crash
// shows a way back instead of a blank screen.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center animate-fade-in">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
        <HeartCrack className="h-8 w-8 text-rose" />
      </div>
      <h1 className="text-xl font-bold text-ink">Ups, ada yang error</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
        Halaman ini gagal dimuat. Coba lagi, atau kembali ke beranda.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" /> Coba Lagi
        </button>
        <Link
          href="/app/home"
          className="rounded-2xl border border-border bg-white py-3.5 text-sm font-semibold text-ink-light"
        >
          Ke Beranda
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-[11px] text-ink-muted/70">Kode: {error.digest}</p>}
    </div>
  )
}
