'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity as ActivityIcon, ArrowLeft, Bell, CalendarDays, Camera, CircleCheck, Heart, HeartHandshake,
  ListChecks, LogOut, Mail, MessageCircle, MessageSquareHeart, PiggyBank, Smile,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import {
  activityActor, fetchActivities, fetchActivitiesSince, getLastSeen, markSeen, relativeTimeID,
  type Activity,
} from '@/lib/activity'
import { cn } from '@/lib/utils'

const KIND_STYLE: Record<string, { icon: typeof Bell; tone: string }> = {
  moment: { icon: Camera, tone: 'bg-rose/10 text-rose' },
  comment: { icon: MessageCircle, tone: 'bg-rose/10 text-rose' },
  reaction: { icon: Heart, tone: 'bg-rose/10 text-rose' },
  mood: { icon: Smile, tone: 'bg-gold/20 text-gold-dark' },
  bucket_add: { icon: ListChecks, tone: 'bg-sage/20 text-sage-dark' },
  bucket_done: { icon: CircleCheck, tone: 'bg-sage/20 text-sage-dark' },
  gratitude: { icon: HeartHandshake, tone: 'bg-gold/20 text-gold-dark' },
  letter: { icon: Mail, tone: 'bg-purple-100 text-purple-600' },
  event: { icon: CalendarDays, tone: 'bg-blue-50 text-blue-600' },
  saving: { icon: PiggyBank, tone: 'bg-sage/20 text-sage-dark' },
  daily: { icon: MessageSquareHeart, tone: 'bg-rose/10 text-rose' },
  left: { icon: LogOut, tone: 'bg-ink/5 text-ink-muted' },
}
const DEFAULT_STYLE = { icon: ActivityIcon, tone: 'bg-ink/5 text-ink-muted' }

const safeUrl = (url: string | null) => (url && url.startsWith('/') && !url.startsWith('//') ? url : null)

export default function AktivitasPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [items, setItems] = useState<Activity[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [moreError, setMoreError] = useState('')
  // Last seen before this visit: partner items newer than this get a "baru" dot.
  const [seenBefore, setSeenBefore] = useState<string | null>(null)
  const itemsRef = useRef<Activity[]>([])
  itemsRef.current = items

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const i = await getCoupleInfo()
        if (!i) { router.replace('/auth/login'); return }
        if (cancelled) return
        setInfo(i)
        if (!i.coupleId) return
        const [lastSeen, page] = await Promise.all([getLastSeen(i.userId), fetchActivities(i.coupleId)])
        if (cancelled) return
        setSeenBefore(lastSeen)
        setItems(page.items)
        setHasMore(page.hasMore)
        // Counts as seen for the bell at once; the list doesn't wait for the write.
        void markSeen(i.userId, page.items[0]?.created_at ?? null).catch(() => {})
      } catch {
        if (!cancelled) setError('Gagal memuat aktivitas. Coba buka ulang halaman ini.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // New rows while the page is open: prepend them and keep them marked as seen.
  const refreshNewest = useCallback(async () => {
    if (!info?.coupleId) return
    const newest = itemsRef.current[0]
    try {
      if (!newest) {
        const page = await fetchActivities(info.coupleId)
        setItems(page.items)
        setHasMore(page.hasMore)
        if (page.items[0]) await markSeen(info.userId, page.items[0].created_at)
        return
      }
      const known = new Set(itemsRef.current.map((a) => a.id))
      const fresh = (await fetchActivitiesSince(info.coupleId, newest.created_at)).filter((a) => !known.has(a.id))
      if (fresh.length === 0) return
      setItems((prev) => {
        const ids = new Set(prev.map((a) => a.id))
        return [...fresh.filter((a) => !ids.has(a.id)), ...prev]
      })
      await markSeen(info.userId, fresh[0].created_at)
    } catch {
      // Live refresh is best effort; the next visit loads everything.
    }
  }, [info])

  useCoupleRealtime(info?.coupleId, ['activities'], refreshNewest)

  async function loadMore() {
    if (!info?.coupleId || items.length === 0) return
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await fetchActivities(info.coupleId, items[items.length - 1])
      setItems((prev) => {
        const known = new Set(prev.map((a) => a.id))
        return [...prev, ...page.items.filter((a) => !known.has(a.id))]
      })
      setHasMore(page.hasMore)
    } catch {
      setMoreError('Gagal memuat lagi, coba sekali lagi')
    } finally {
      setLoadingMore(false)
    }
  }

  const isNew = (a: Activity) =>
    a.actor_id !== info?.userId && (!seenBefore || Date.parse(a.created_at) > Date.parse(seenBefore))

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/home" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Beranda
        </Link>
        <h1 className="text-xl font-bold text-ink">Aktivitas</h1>
        <p className="text-sm text-ink-muted">Apa saja yang kalian lakukan di Nanti Kita</p>
      </div>

      {loading ? (
        <div className="space-y-3 px-6 pt-5">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : error ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : !info?.coupleId ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Hubungkan akunmu dengan pasangan dulu untuk melihat aktivitas kalian.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Profil</Link>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
            <Bell className="h-8 w-8 text-rose" />
          </div>
          <h2 className="text-lg font-bold text-ink">Belum ada aktivitas</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Moment, mood, tabungan, dan surat yang kalian buat akan muncul di sini.
          </p>
        </div>
      ) : (
        <div className="px-6 pt-5">
          <ul className="space-y-2.5">
            {items.map((a) => {
              const style = KIND_STYLE[a.kind] ?? DEFAULT_STYLE
              const Icon = style.icon
              const href = safeUrl(a.url)
              const fresh = isNew(a)
              const body = (
                <>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', style.tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-ink">
                      <span className="font-bold">{activityActor(a, info.userId, info.names)}</span> {a.summary}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{relativeTimeID(a.created_at)}</span>
                  </span>
                  {fresh && (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose" aria-hidden="true" />
                      <span className="sr-only">(baru)</span>
                    </>
                  )}
                </>
              )
              const cls = cn(
                'flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-card transition-all',
                fresh ? 'border-rose/30' : 'border-border',
                href && 'active:scale-[0.99]',
              )
              return (
                <li key={a.id}>
                  {href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
                </li>
              )
            })}
          </ul>
          {moreError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{moreError}</p>}
          {hasMore && (
            <Button variant="secondary" size="sm" className="mt-5" loading={loadingMore} onClick={loadMore}>
              Muat lagi
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
