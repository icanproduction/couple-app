'use client'

import Link from 'next/link'
import { ChevronRight, PartyPopper, Trophy } from 'lucide-react'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { milestoneStatus } from '@/lib/milestones'

interface MilestoneCardProps {
  /** Earliest relationship_start_date of both partners ("YYYY-MM-DD") */
  startDate: string | null
}

export default function MilestoneCard({ startDate }: MilestoneCardProps) {
  if (!startDate) {
    return (
      <Link
        href="/app/profile?edit=1"
        className="mx-6 flex items-center gap-3 rounded-2xl border border-dashed border-gold bg-gold/5 p-4 transition-all active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15">
          <Trophy className="h-5 w-5 text-yellow-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Milestone kalian</p>
          <p className="text-xs text-ink-muted">Isi tanggal jadian di Profil untuk lihat hitung mundurnya</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
      </Link>
    )
  }

  const { passed, next } = milestoneStatus(startDate, todayJakarta())
  if (!next) return null

  // Progress from the previous milestone (or the start) to the next one
  const prevDays = passed.length ? passed[passed.length - 1].days : 0
  const span = Math.max(1, next.days - prevDays)
  const percent = Math.min(100, Math.max(0, Math.round(((span - next.daysLeft) / span) * 100)))

  if (next.daysLeft === 0) {
    return (
      <Link
        href="/app/milestone"
        className="mx-6 block overflow-hidden rounded-2xl bg-gradient-to-br from-rose via-rose-light to-gold p-4 text-white shadow-elevated transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider text-white/90">Hari ini!</span>
          <ChevronRight className="ml-auto h-4 w-4 text-white/80" />
        </div>
        <p className="mt-2 text-2xl font-bold">{next.label} bersama 🎉</p>
        <p className="text-sm text-white/90">{next.caption}. Rayakan berdua, ya!</p>
      </Link>
    )
  }

  return (
    <Link
      href="/app/milestone"
      className="mx-6 block rounded-2xl border border-border bg-white p-4 shadow-card transition-all hover:border-gold active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gold/15">
          <Trophy className="h-3.5 w-3.5 text-yellow-700" strokeWidth={2} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Milestone Berikutnya</span>
        <ChevronRight className="ml-auto h-4 w-4 text-ink-muted" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{next.label}</p>
          <p className="truncate text-xs text-ink-muted">{next.caption} · {formatDateID(next.date)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-bold leading-none text-rose">{next.daysLeft.toLocaleString('id-ID')}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">hari lagi</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream" aria-hidden>
        <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
      </div>
    </Link>
  )
}
