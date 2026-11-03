'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Camera, CircleCheck, Flag, Heart, Mail, PawPrint, Route, Star, UserPlus } from 'lucide-react'
import { formatDateID, formatDateShortID } from '@/lib/dates'
import { getCoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import { groupByYear, loadTimeline, type TimelineEntry, type TimelineKind } from '@/lib/timeline'
import { cn } from '@/lib/utils'

type Filter = 'semua' | 'moment' | 'milestone' | 'bucket' | 'letter' | 'event' | 'spesial'

const FILTERS: { key: Filter; label: string; kinds: TimelineKind[] }[] = [
  { key: 'semua', label: 'All', kinds: [] }, // copy-ok: internal filter key, never shown
  { key: 'moment', label: 'Moments', kinds: ['moment'] },
  { key: 'milestone', label: 'Milestones', kinds: ['milestone'] },
  { key: 'bucket', label: 'Bucket List', kinds: ['bucket'] },
  { key: 'letter', label: 'Letters', kinds: ['letter'] },
  { key: 'event', label: 'Calendar', kinds: ['event'] },
  { key: 'spesial', label: 'Special days', kinds: ['start', 'joined', 'pet'] },
]

const KIND_STYLE: Record<TimelineKind, { icon: typeof Heart; tone: string }> = {
  start: { icon: Heart, tone: 'bg-rose text-white' },
  milestone: { icon: Star, tone: 'bg-gold/25 text-gold-dark' },
  moment: { icon: Camera, tone: 'bg-rose/10 text-rose' },
  bucket: { icon: CircleCheck, tone: 'bg-sage/20 text-sage-dark' },
  letter: { icon: Mail, tone: 'bg-purple-100 text-purple-600' },
  event: { icon: CalendarDays, tone: 'bg-blue-50 text-blue-600' },
  joined: { icon: UserPlus, tone: 'bg-rose/10 text-rose' },
  pet: { icon: PawPrint, tone: 'bg-gold/20 text-gold-dark' },
}

function EntryCard({ entry }: { entry: TimelineEntry }) {
  const { icon: Icon, tone } = KIND_STYLE[entry.kind]
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{formatDateShortID(entry.date)}</p>
        <p className="mt-0.5 font-bold leading-snug text-ink">{entry.title}</p>
        {entry.subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{entry.subtitle}</p>}
      </div>
      {entry.kind === 'moment' && (
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-rose-50">
          {entry.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
            <img src={entry.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center"><Camera className="h-5 w-5 text-rose/40" /></div>
          )}
        </div>
      )}
    </>
  )
  const cardCls = cn(
    'flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-card',
    entry.kind === 'start' ? 'border-rose/40' : 'border-border',
    entry.href && 'transition-all active:scale-[0.99]',
  )
  return (
    <li className="relative pl-12">
      <span className={cn('absolute left-0 top-3 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-cream', tone)}>
        <Icon className="h-4 w-4" />
      </span>
      {entry.href ? <Link href={entry.href} className={cardCls}>{content}</Link> : <div className={cardCls}>{content}</div>}
    </li>
  )
}

export default function PerjalananPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [hasCouple, setHasCouple] = useState(true)
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [startDate, setStartDate] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('semua') // copy-ok: internal filter key, never shown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (isInitial: boolean) => {
    try {
      const info = await getCoupleInfo()
      if (!info) { router.replace('/auth/login'); return }
      if (!info.coupleId) { setHasCouple(false); return }
      setCoupleId(info.coupleId)
      const timeline = await loadTimeline(info)
      setEntries(timeline.entries)
      setStartDate(timeline.startDate)
      setError('')
    } catch {
      if (isInitial) setError("Couldn't load your story. Try reopening this page.")
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [router])

  useEffect(() => { load(true) }, [load])
  useCoupleRealtime(coupleId, ['moments', 'bucket_items', 'couple_events'], () => load(false))

  const counts = new Map<Filter, number>()
  for (const f of FILTERS) {
    counts.set(f.key, f.key === 'semua' ? entries.length : entries.filter((e) => f.kinds.includes(e.kind)).length)
  }
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]
  const visible = filter === 'semua' ? entries : entries.filter((e) => active.kinds.includes(e.kind))
  const groups = groupByYear(visible)

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <h1 className="text-xl font-bold text-ink">Our Story</h1>
        <p className="text-sm text-ink-muted">
          {startDate ? `Since ${formatDateID(startDate)} · ${entries.length} ${entries.length === 1 ? 'story' : 'stories'}` : 'All your stories on one timeline'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3 px-6 pt-5">
          <div className="h-8 w-2/3 animate-pulse rounded-full bg-rose-50" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="ml-12 h-20 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : error ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : !hasCouple ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Connect with your partner first to see your story.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
            <Route className="h-8 w-8 text-rose" />
          </div>
          <h2 className="text-lg font-bold text-ink">Your story is just starting</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Add your start date in Profile and save your first Moment. Everything will line up here.
          </p>
          <Link
            href="/app/moments/baru"
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Save your first Moment
          </Link>
          <Link href="/app/profile" className="mt-3 text-sm font-semibold text-rose">Set your start date</Link>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-6 pb-1 pt-4 [scrollbar-width:none]" role="group" aria-label="Filter your story">
            {FILTERS.filter((f) => f.key === 'semua' || (counts.get(f.key) ?? 0) > 0).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all',
                  filter === f.key ? 'border-rose bg-rose text-white' : 'border-border bg-white text-ink-light',
                )}
              >
                {f.label} <span className={filter === f.key ? 'text-white/80' : 'text-ink-muted'}>{counts.get(f.key)}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="px-8 pt-12 text-center">
              <Flag className="mx-auto h-6 w-6 text-rose/50" />
              <p className="mt-2 text-sm text-ink-muted">Nothing in this category yet.</p>
            </div>
          ) : (
            <div className="space-y-7 px-6 pt-5">
              {groups.map((group) => (
                <section key={group.year}>
                  <h2 className="mb-3 text-sm font-bold text-ink">{group.year}</h2>
                  <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-0.5 before:bg-border">
                    {group.items.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
