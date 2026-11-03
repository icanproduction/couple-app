'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarHeart, Check, PartyPopper, RefreshCw, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { daysSince, formatDateID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo } from '@/lib/moments'
import { milestoneStatus, milestonesFor } from '@/lib/milestones'
import { cn } from '@/lib/utils'

const UPCOMING_SHOWN = 6

/** Earliest of the partners' start dates ("YYYY-MM-DD" sorts as text), same rule as home */
function earliestDate(dates: (string | null | undefined)[]): string | null {
  return dates.filter((d): d is string => !!d).sort()[0] ?? null
}

export default function MilestonePage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'ready' | 'nostart' | 'error'>('loading')
  const [startDate, setStartDate] = useState<string | null>(null)
  const [today, setToday] = useState(() => todayJakarta())

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const info = await getCoupleInfo()
      if (!info) { router.replace('/auth/login'); return }
      const ids = [info.userId, ...(info.partnerId ? [info.partnerId] : [])]
      const { data, error } = await createClient().from('profiles').select('id, relationship_start_date').in('id', ids)
      if (error) throw error
      const start = earliestDate((data ?? []).map((p) => p.relationship_start_date))
      setToday(todayJakarta())
      setStartDate(start)
      setStatus(start ? 'ready' : 'nostart')
    } catch {
      setStatus('error')
    }
  }, [router])

  useEffect(() => { load() }, [load])

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/jelajah" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Jelajah
        </Link>
        <h1 className="text-xl font-bold text-ink">Milestones</h1>
        <p className="text-sm text-ink-muted">100 days, 1 year and more</p>
      </div>

      {status === 'loading' ? (
        <div className="space-y-4 px-6 pt-5">
          <div className="h-52 animate-pulse rounded-3xl bg-rose-50" />
          <div className="h-40 animate-pulse rounded-2xl bg-rose-50" />
        </div>
      ) : status === 'error' ? (
        <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-sm text-red-600">Couldn&apos;t load your milestones.</p>
          <button onClick={() => load()} className="flex items-center gap-1 text-xs font-semibold text-red-600">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : status === 'nostart' || !startDate ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15">
            <CalendarHeart className="h-8 w-8 text-yellow-700" />
          </div>
          <h2 className="text-lg font-bold text-ink">When did you two get together?</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Add the day you got together to your profile. Countdowns to every milestone will show up here.
          </p>
          <Link
            href="/app/profile?edit=1"
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Add your start date
          </Link>
        </div>
      ) : (
        <MilestoneView startDate={startDate} today={today} />
      )}
    </div>
  )
}

function MilestoneView({ startDate, today }: { startDate: string; today: string }) {
  const together = daysSince(startDate)
  const { passed, next } = milestoneStatus(startDate, today)
  const years = Math.max(10, Math.ceil(Math.max(0, together) / 365) + 3)
  const upcoming = milestonesFor(startDate, years)
    .filter((m) => m.date >= today && m.key !== next?.key)
    .slice(0, UPCOMING_SHOWN)
  const passedNewest = [...passed].reverse()

  return (
    <div className="space-y-6 px-6 pt-5">
      {/* Hero countdown */}
      {next && next.daysLeft === 0 ? (
        <section className="rounded-3xl bg-gradient-to-br from-rose via-rose-light to-gold p-6 text-center text-white shadow-elevated">
          <PartyPopper className="mx-auto h-8 w-8" />
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/90">Today!</p>
          <p className="mt-1 text-4xl font-bold">{next.label}</p>
          <p className="mt-1 text-sm text-white/90">{next.caption}. Congratulations to you both.</p>
        </section>
      ) : next ? (
        <section className="rounded-3xl border border-border bg-white p-6 text-center shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Next up: {next.label}</p>
          <p className="mt-2 text-6xl font-bold leading-none text-rose">{next.daysLeft.toLocaleString('en-GB')}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{next.daysLeft === 1 ? 'day to go' : 'days to go'}</p>
          <p className="mt-1 text-xs text-ink-muted">{next.caption} · {formatDateID(next.date)}</p>
        </section>
      ) : null}

      <p className="text-center text-xs text-ink-muted">
        {together >= 0
          ? <><span className="font-bold text-ink">{together.toLocaleString('en-GB')} {together === 1 ? 'day' : 'days'}</span> together since {formatDateID(startDate)}</>
          : <>Together from {formatDateID(startDate)}</>}
      </p>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Coming up</h2>
          <ul className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            {upcoming.map((m, i) => (
              <li key={m.key} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15">
                  <Trophy className="h-4 w-4 text-yellow-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{m.label}</p>
                  <p className="truncate text-xs text-ink-muted">{m.caption} · {formatDateID(m.date)}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-rose">
                  in {(m.days - together).toLocaleString('en-GB')} {m.days - together === 1 ? 'day' : 'days'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Passed */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Already reached</h2>
        {passedNewest.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-ink-muted">
            Your first milestone is coming up soon.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            {passedNewest.map((m, i) => (
              <li key={m.key} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage/15">
                  <Check className="h-4 w-4 text-sage-dark" strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{m.label}</p>
                  <p className="truncate text-xs text-ink-muted">{m.caption}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-light">{formatDateID(m.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[11px] text-ink-muted">
        We use the earlier start date from your two profiles.{' '}
        <Link href="/app/profile?edit=1" className="font-semibold text-rose">Change it in Profile</Link>
      </p>
    </div>
  )
}
