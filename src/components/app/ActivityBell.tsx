'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getUnreadCount } from '@/lib/activity'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'

interface ActivityBellProps {
  coupleId: string | null
  userId: string
  className?: string
}

/** Bell with the partner's unread activity count (F23). Live via realtime. */
export default function ActivityBell({ coupleId, userId, className }: ActivityBellProps) {
  const [unread, setUnread] = useState(0)

  const load = useCallback(() => {
    if (!coupleId || !userId) { setUnread(0); return }
    getUnreadCount(coupleId, userId).then(setUnread).catch(() => {})
  }, [coupleId, userId])

  useEffect(() => {
    load()
    // Coming back to the tab (e.g. after reading the feed elsewhere) refreshes the badge.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  useCoupleRealtime(coupleId, ['activities'], load)

  const badge = unread > 9 ? '9+' : String(unread)
  return (
    <Link
      href="/app/aktivitas"
      aria-label={unread > 0 ? `Aktivitas, ${unread} belum dilihat` : 'Aktivitas'}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-ink-light shadow-card transition-all active:scale-95',
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
