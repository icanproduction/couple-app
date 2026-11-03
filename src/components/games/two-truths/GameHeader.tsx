'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

interface GameHeaderProps {
  title: string
  subtitle?: string
  backHref: string
  backLabel: string
}

/** Same header shape as the other game pages: back link, title, one line under it. */
export default function GameHeader({ title, subtitle, backHref, backLabel }: GameHeaderProps) {
  const router = useRouter()
  return (
    <div className="border-b border-border bg-white px-6 py-5">
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="-ml-1 mb-3 flex items-center gap-1 rounded-lg px-1 py-0.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
      </button>
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  )
}
