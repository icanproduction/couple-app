'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'
import {
  isPushSupported,
  getNotificationPermission,
  enablePushNotifications,
  removePushSubscription,
} from '@/lib/notifications'

/** Does this browser currently hold a push subscription? */
async function hasSubscription(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return !!(await registration?.pushManager.getSubscription())
  } catch {
    return false
  }
}

/** Push on/off for this device. Which kinds arrive is set on /app/profile/notifikasi. */
export default function NotificationToggle() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const ok = await isPushSupported()
      const perm = await getNotificationPermission()
      const sub = ok && perm === 'granted' ? await hasSubscription() : false
      if (cancelled) return
      setSupported(ok)
      setPermission(perm)
      setSubscribed(sub)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Permission alone isn't "on": turning it off removes the subscription but
  // the browser keeps the permission.
  const isEnabled = permission === 'granted' && subscribed
  const isDenied = permission === 'denied'

  async function handleToggle() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      if (isEnabled) {
        await removePushSubscription()
        setSubscribed(false)
      } else {
        const success = await enablePushNotifications()
        const perm = await getNotificationPermission()
        setPermission(perm)
        setSubscribed(success)
        if (!success && perm === 'granted') setError('Gagal mengaktifkan notifikasi. Coba lagi, ya.')
      }
    } catch {
      setError('Gagal mengubah notifikasi. Coba lagi, ya.')
    }
    setLoading(false)
  }

  if (supported === null) {
    return <div className="h-[62px] animate-pulse rounded-xl border border-border bg-white" />
  }

  if (!supported) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3.5">
        <div className="flex items-center gap-3">
          <BellOff className="h-4 w-4 text-ink-muted" />
          <div>
            <p className="text-sm font-medium text-ink-muted">Notifikasi</p>
            <p className="text-xs text-ink-muted/60">
              Tidak didukung browser ini. Di iPhone, tambahkan Nanti Kita ke Home Screen dulu.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label="Notifikasi push di perangkat ini"
        onClick={handleToggle}
        disabled={loading || isDenied}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3.5 text-left transition-colors hover:bg-cream disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          {isEnabled
            ? <Bell className="h-4 w-4 text-rose" />
            : <BellOff className="h-4 w-4 text-ink-muted" />
          }
          <div>
            <p className="text-sm font-medium text-ink">Notifikasi Push</p>
            <p className="text-xs text-ink-muted">
              {isDenied
                ? 'Diblokir — aktifkan di pengaturan browser'
                : loading
                ? 'Sebentar...'
                : isEnabled
                ? 'Aktif di perangkat ini'
                : 'Aktifkan supaya kabar dari pasanganmu langsung sampai'}
            </p>
          </div>
        </div>

        <div className={`flex h-7 w-12 flex-shrink-0 items-center rounded-full px-0.5 transition-colors ${
          isEnabled ? 'bg-rose' : 'bg-border'
        }`}>
          <div className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            isEnabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
      </button>
      {error && <p role="alert" className="mt-1.5 px-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
