'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageCircleHeart, Users, Bell, ChevronRight, Heart, Sparkles } from 'lucide-react'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/deep-talk', label: 'Deep Talk', icon: MessageCircleHeart, exact: false },
  { href: '/admin/notifications', label: 'Notifikasi', icon: Bell, exact: false },
  { href: '/admin/users', label: 'Pengguna', icon: Users, exact: false },
  { href: '/admin/ai', label: 'Pengaturan AI', icon: Sparkles, exact: false },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const tabsRef = useRef<HTMLElement>(null)

  // On phones the tab strip is wider than the screen: keep the current tab visible.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <>
      {/* Phone / tablet: top bar with scrollable tabs */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose">
              <Heart className="h-3.5 w-3.5 text-white" fill="currentColor" />
            </div>
            <p className="text-sm font-bold text-ink">Admin Panel</p>
          </div>
          <Link href="/app/home" className="text-xs text-ink-muted hover:text-ink transition-colors">
            ← Kembali ke App
          </Link>
        </div>
        <nav ref={tabsRef} className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map(item => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-rose/10 text-rose' : 'text-ink-muted hover:bg-gray-50 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Desktop: sidebar */}
      <aside className="hidden w-56 flex-shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose">
            <Heart className="h-4 w-4 text-white" fill="currentColor" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">Nanti Kita</p>
            <p className="text-[10px] text-ink-muted">Admin Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map(item => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-rose/10 text-rose'
                    : 'text-ink-muted hover:bg-gray-50 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {item.label}
                {active && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gray-100 p-4">
          <Link href="/app/home" className="text-xs text-ink-muted hover:text-ink transition-colors">
            ← Kembali ke App
          </Link>
        </div>
      </aside>
    </>
  )
}
