'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      // Dev chunks aren't content-hashed, so a cache-first worker would serve
      // stale code after every edit. Remove any worker left from a prod build.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined)
      return
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed silently
    })
  }, [])

  return null
}
