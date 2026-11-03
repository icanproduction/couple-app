'use client'

import { memo, useTransition, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Compass, Camera, CalendarDays, User } from 'lucide-react'
import { cn } from '@/lib/utils'

// The partner page moved into Jelajah (the hub of every feature) to make room.
const leftTabs = [
  { href: '/app/home',     icon: Home,     label: 'Home' },
  { href: '/app/jelajah',  icon: Compass,  label: 'Jelajah' },
]

const rightTabs = [
  { href: '/app/calendar', icon: CalendarDays, label: 'Calendar' },
  { href: '/app/profile',  icon: User,         label: 'Profile' },
]

function BottomNavInner() {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const navigate = useCallback((href: string) => {
    // Exact match only: from a sub-page (/app/profile/notifikasi) the tab goes back to its root.
    if (pathname === href) return
    startTransition(() => {
      router.push(href)
    })
  }, [pathname, router, startTransition])

  // Every page without its own tab (Money, Mood, Games…) lives under Jelajah.
  const ownTab = ['/app/home', '/app/moments', '/app/calendar', '/app/profile'].some((h) => pathname.startsWith(h))
  const momentsActive = pathname.startsWith('/app/moments')

  function renderTab(href: string, Icon: typeof Home, label: string) {
    const active = pathname.startsWith(href) || (href === '/app/jelajah' && !ownTab)
    return (
      <button
        key={href}
        onClick={() => navigate(href)}
        aria-current={active ? 'page' : undefined}
        className="flex flex-1 flex-col items-center gap-0.5 py-2"
      >
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-rose-50' : ''
        )}>
          <Icon
            className={cn('h-5 w-5 transition-colors', active ? 'text-rose' : 'text-ink-muted')}
            strokeWidth={active ? 2.5 : 1.5}
          />
        </div>
        <span className={cn(
          'text-[10px] font-medium leading-none',
          active ? 'text-rose' : 'text-ink-muted'
        )}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <nav className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t border-border bg-surface print:hidden">
      {/* Loading indicator */}
      {isPending && (
        <div className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-rose to-transparent" />
        </div>
      )}

      <div className="flex items-center justify-around px-2 pb-safe-nav pt-1">
        {leftTabs.map(({ href, icon, label }) => renderTab(href, icon, label))}

        {/* Center floating button: Moments (Money lives in Jelajah → Plans) */}
        <div className="flex flex-1 flex-col items-center -mt-5">
          <button
            onClick={() => navigate('/app/moments')}
            aria-label="Moments"
            aria-current={momentsActive ? 'page' : undefined}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full shadow-elevated transition-all active:scale-95',
              momentsActive ? 'bg-rose-dark' : 'bg-rose'
            )}
          >
            <Camera className="h-6 w-6 text-white" strokeWidth={2} />
          </button>
          <span aria-hidden className={cn(
            'mt-1 text-[10px] font-medium leading-none',
            momentsActive ? 'text-rose' : 'text-ink-muted'
          )}>
            Moments
          </span>
        </div>

        {rightTabs.map(({ href, icon, label }) => renderTab(href, icon, label))}
      </div>
    </nav>
  )
}

export default memo(BottomNavInner)
