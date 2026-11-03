'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, Share, MoreHorizontal, Plus, Bell, BellOff } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { isPushSupported, getNotificationPermission, enablePushNotifications } from '@/lib/notifications'

type Platform = 'ios' | 'android'

export default function OnboardingInstallPage() {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('ios')
  const [loading, setLoading] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [enablingPush, setEnablingPush] = useState(false)

  useEffect(() => {
    isPushSupported().then(setPushSupported)
    getNotificationPermission().then(setPushPermission)
  }, [])

  async function handleEnablePush() {
    setEnablingPush(true)
    const success = await enablePushNotifications()
    setPushPermission(success ? 'granted' : 'denied')
    setEnablingPush(false)
  }

  async function handleFinish() {
    setLoading(true)
    const supabase = createClient()
    const user = await getClientUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', user.id)
    }
    router.push('/app/home')
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
          <Smartphone className="h-7 w-7 text-rose" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Pasang di Homescreen</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tambahkan ke layar utama untuk akses cepat seperti aplikasi biasa
        </p>
      </div>

      {/* Push notification prompt — show first */}
      {pushSupported && pushPermission !== 'granted' && (
        <div className="mb-6 rounded-2xl border border-rose/20 bg-rose/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose/10">
              <Bell className="h-5 w-5 text-rose" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-ink">Aktifkan Notifikasi</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Supaya tahu kalau pasangan kangen, kirim surat, atau ada momen spesial
              </p>
              {pushPermission === 'denied' ? (
                <p className="mt-2 text-xs text-amber-600 font-medium">
                  Notifikasi diblokir — aktifkan manual di pengaturan browser
                </p>
              ) : (
                <button
                  onClick={handleEnablePush}
                  disabled={enablingPush}
                  className="mt-2.5 rounded-xl bg-rose px-4 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                >
                  {enablingPush ? 'Mengaktifkan...' : 'Aktifkan Notifikasi'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {pushPermission === 'granted' && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-sage/10 border border-sage/20 px-4 py-3">
          <Bell className="h-4 w-4 text-sage flex-shrink-0" />
          <p className="text-sm font-semibold text-sage">Notifikasi aktif ✓</p>
        </div>
      )}

      {/* Platform toggle */}
      <div className="mb-6 flex rounded-xl border border-border bg-white p-1">
        {(['ios', 'android'] as Platform[]).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              platform === p
                ? 'bg-rose text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {p === 'ios' ? 'iPhone / iPad' : 'Android'}
          </button>
        ))}
      </div>

      {/* Instructions */}
      <div className="mb-8 space-y-4">
        {platform === 'ios' ? (
          <>
            <Step num={1} icon={<Share className="h-4 w-4" />}>
              Buka Safari, lalu ketuk ikon <strong>Bagikan</strong> (kotak dengan panah ke atas) di bagian bawah layar
            </Step>
            <Step num={2} icon={<Plus className="h-4 w-4" />}>
              Gulir ke bawah dan pilih <strong>&ldquo;Tambahkan ke Layar Utama&rdquo;</strong>
            </Step>
            <Step num={3} icon={<Smartphone className="h-4 w-4" />}>
              Ketuk <strong>&ldquo;Tambahkan&rdquo;</strong> di pojok kanan atas
            </Step>
          </>
        ) : (
          <>
            <Step num={1} icon={<MoreHorizontal className="h-4 w-4" />}>
              Buka Chrome, ketuk ikon <strong>menu tiga titik</strong> di pojok kanan atas
            </Step>
            <Step num={2} icon={<Plus className="h-4 w-4" />}>
              Pilih <strong>&ldquo;Tambahkan ke Layar Utama&rdquo;</strong>
            </Step>
            <Step num={3} icon={<Smartphone className="h-4 w-4" />}>
              Ketuk <strong>&ldquo;Tambahkan&rdquo;</strong> untuk konfirmasi
            </Step>
          </>
        )}
      </div>

      <div className="space-y-3">
        <Button onClick={handleFinish} loading={loading} size="lg">
          Selesai, Mulai Pakai!
        </Button>
        <button
          onClick={handleFinish}
          className="w-full py-3 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Lewati
        </button>
      </div>
    </div>
  )
}

function Step({
  num,
  icon,
  children,
}: {
  num: number
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-bold text-rose">
        {num}
      </div>
      <div className="flex items-start gap-2 pt-1">
        <span className="mt-0.5 text-ink-muted">{icon}</span>
        <p className="text-sm text-ink">{children}</p>
      </div>
    </div>
  )
}
