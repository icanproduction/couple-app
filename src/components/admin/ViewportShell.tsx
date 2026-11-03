'use client'

import { usePathname } from 'next/navigation'

// The app is a phone-width PWA; only the admin panel uses the whole window.
export default function ViewportShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')

  return (
    <main className={isAdmin ? 'min-h-screen' : 'mx-auto max-w-lg'}>
      {children}
    </main>
  )
}
