'use client'

// "On This Day" (F13): moments from this calendar day in earlier years,
// or (when there are none) from exactly one month ago. Renders nothing when
// there's nothing to remember (and while loading, so the home page doesn't jump).
// Self-padded (px-4) like the other home cards.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, ChevronRight, History, MapPin } from 'lucide-react'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { getOnThisDay, type MomentWithPhotos, type OnThisDay } from '@/lib/moments'
import SignedPhoto from './SignedPhoto'

function agoLabel(kind: OnThisDay['kind'], m: MomentWithPhotos, today: string): string {
  if (kind === 'month') return 'A month ago today'
  const years = Number(today.slice(0, 4)) - Number(m.moment_date.slice(0, 4))
  return years === 1 ? 'A year ago today' : `${years} years ago today`
}

export default function OnThisDayCard({ coupleId }: { coupleId: string | null }) {
  const [memory, setMemory] = useState<OnThisDay | null>(null)
  const [today] = useState(() => todayJakarta())

  useEffect(() => {
    if (!coupleId) { setMemory(null); return }
    let cancelled = false
    getOnThisDay(coupleId, today)
      .then((result) => { if (!cancelled) setMemory(result) })
      .catch(() => { if (!cancelled) setMemory(null) })
    return () => { cancelled = true }
  }, [coupleId, today])

  if (!memory || memory.moments.length === 0) return null
  const many = memory.moments.length > 1

  return (
    <section aria-label="On This Day" className="animate-fade-in px-6">
      <div className="mb-2 flex items-center gap-1.5">
        <History className="h-4 w-4 text-rose" />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">On This Day</p>
      </div>
      <div
        className={cn(
          'flex gap-3',
          many && '-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        {memory.moments.map((m) => {
          const cover = m.photos[0]
          return (
            <Link
              key={m.id}
              href={`/app/moments/${m.id}`}
              className={cn(
                'group relative block overflow-hidden rounded-2xl bg-rose-50 shadow-card transition-transform active:scale-[0.99]',
                many ? 'w-[82%] shrink-0 snap-start' : 'w-full'
              )}
            >
              <div className="relative aspect-[16/10]">
                {cover?.url ? (
                  <SignedPhoto src={cover.url} path={cover.storage_path} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center"><Camera className="h-8 w-8 text-rose/40" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-rose">
                  {agoLabel(memory.kind, m, today)}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{m.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/80">
                      {formatDateID(m.moment_date)}
                      {m.location_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{m.location_name}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-white/90" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
