'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Moon } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { hourLabel, inQuietHours } from '@/lib/quiet-hours'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import NotificationToggle from '@/components/app/NotificationToggle'

type KindKey = 'kangen' | 'letters' | 'moments' | 'reminders' | 'activity'

interface Prefs {
  kangen: boolean
  letters: boolean
  moments: boolean
  reminders: boolean
  activity: boolean
  quiet_start: number | null
  quiet_end: number | null
}

// No row yet means everything is on (same default as the database).
const DEFAULTS: Prefs = {
  kangen: true, letters: true, moments: true, reminders: true, activity: true,
  quiet_start: null, quiet_end: null,
}
const PREF_COLUMNS = 'kangen, letters, moments, reminders, activity, quiet_start, quiet_end'
const QUIET_DEFAULT = { start: 22, end: 6 }
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const KINDS: { key: KindKey; label: string; desc: string }[] = [
  { key: 'kangen', label: 'Kangen', desc: 'Saat pasanganmu menekan tombol kangen' },
  { key: 'letters', label: 'Surat', desc: 'Surat baru dan surat yang sudah bisa dibuka' },
  { key: 'moments', label: 'Moment', desc: 'Moment baru, komentar, dan reaksi' },
  { key: 'reminders', label: 'Pengingat kalender', desc: 'Ulang tahun, anniversary, dan acara yang kamu beri pengingat' },
  { key: 'activity', label: 'Aktivitas pasangan', desc: 'Mood, bucket list, tabungan, toples, dan pertanyaan harian' },
]

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'flex h-7 w-12 flex-shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-50',
        checked ? 'bg-rose' : 'bg-border'
      )}
    >
      <span className={cn('h-6 w-6 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted/50">{children}</p>
}

export default function NotificationSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(0)
  // Last state the database confirmed — what we fall back to on a failed save.
  const savedRef = useRef<Prefs>(DEFAULTS)
  // Saves run one after another so a slow request can't land after a newer one.
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  // Number of the newest queued save; only that one may set the screen.
  const latestRef = useRef(0)

  /** The prefs row as stored (DEFAULTS when there is none yet). */
  const fetchPrefs = useCallback(async (profileId: string): Promise<Prefs | null> => {
    const { data, error } = await createClient()
      .from('notification_prefs')
      .select(PREF_COLUMNS)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error) return null
    return data ?? DEFAULTS
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setUserId(user.id)
    const stored = await fetchPrefs(user.id)
    if (!stored) {
      setLoadError('Gagal memuat pengaturan notifikasi.')
    } else {
      savedRef.current = stored
      setPrefs(stored)
    }
    setLoading(false)
  }, [router, fetchPrefs])

  useEffect(() => { load() }, [load])

  /**
   * Optimistic save. The screen always ends up matching the database: the
   * newest save shows the row the database returned, and a failed save
   * re-reads the row (falling back to the last confirmed state if that fails too).
   */
  function save(next: Prefs) {
    if (!userId) return
    setPrefs(next)
    setSaveError('')
    setSaving((n) => n + 1)
    const seq = ++latestRef.current
    chainRef.current = chainRef.current.then(async () => {
      const { data, error } = await createClient()
        .from('notification_prefs')
        .upsert({ profile_id: userId, ...next }, { onConflict: 'profile_id' })
        .select(PREF_COLUMNS)
        .single()
      if (error || !data) {
        setSaveError('Belum tersimpan. Cek koneksimu lalu coba lagi.')
        const stored = await fetchPrefs(userId)
        if (stored) savedRef.current = stored
        if (seq === latestRef.current) setPrefs(savedRef.current)
      } else {
        savedRef.current = data
        setSavedAt(Date.now())
        if (seq === latestRef.current) setPrefs(data)
      }
      setSaving((n) => n - 1)
    })
  }

  const quietOn = prefs.quiet_start !== null && prefs.quiet_end !== null

  function toggleQuiet() {
    save(quietOn
      ? { ...prefs, quiet_start: null, quiet_end: null }
      : { ...prefs, quiet_start: QUIET_DEFAULT.start, quiet_end: QUIET_DEFAULT.end })
  }

  function setQuietHour(which: 'quiet_start' | 'quiet_end', hour: number) {
    const next = { ...prefs, [which]: hour }
    if (next.quiet_start === next.quiet_end) {
      setSaveError('Jam mulai dan jam selesai tidak boleh sama.')
      return
    }
    save(next)
  }

  const quietNow = quietOn && inQuietHours(prefs.quiet_start, prefs.quiet_end)

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/app/profile')} aria-label="Kembali ke Profil" className="rounded-lg p-1 hover:bg-cream">
            <ArrowLeft className="h-5 w-5 text-ink-muted" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">Notifikasi</h1>
            <p className="text-sm text-ink-muted">Atur kabar apa saja yang mau kamu terima</p>
          </div>
          <span aria-live="polite" className="text-xs text-ink-muted">
            {saving > 0 ? 'Menyimpan...' : savedAt ? <span className="flex items-center gap-1 text-sage-dark"><Check className="h-3.5 w-3.5" /> Tersimpan</span> : null}
          </span>
        </div>
      </div>

      <div className="space-y-6 px-6 pt-5">
        <div>
          <SectionLabel>Perangkat ini</SectionLabel>
          <NotificationToggle />
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-border bg-white p-5 text-center shadow-card">
            <p className="text-sm text-danger">{loadError}</p>
            <Button onClick={load} variant="secondary" size="sm" className="mt-4">Coba lagi</Button>
          </div>
        ) : (
          <>
            {saveError && (
              <p role="alert" className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs text-danger">{saveError}</p>
            )}

            <div>
              <SectionLabel>Kirimi aku kabar soal</SectionLabel>
              <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
                {KINDS.map((k, i) => (
                  <div key={k.key} className={cn('flex items-center gap-3 px-4 py-3.5', i < KINDS.length - 1 && 'border-b border-border')}>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">{k.label}</p>
                      <p className="text-[11px] leading-relaxed text-ink-muted">{k.desc}</p>
                    </div>
                    <Switch
                      checked={prefs[k.key]}
                      label={`Notifikasi ${k.label}`}
                      onChange={() => save({ ...prefs, [k.key]: !prefs[k.key] })}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-muted">
                Berlaku di semua perangkatmu. Kalau dimatikan, kabarnya tetap ada di aplikasi, hanya tidak dikirim sebagai notifikasi.
              </p>
            </div>

            <div>
              <SectionLabel>Jam tenang</SectionLabel>
              <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream">
                    <Moon className="h-4 w-4 text-ink-muted" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">Jam tenang</p>
                    <p className="text-[11px] text-ink-muted">
                      {quietOn
                        ? `${hourLabel(prefs.quiet_start!)} sampai ${hourLabel(prefs.quiet_end!)} WIB${quietNow ? ' · sedang berlaku' : ''}`
                        : 'Tahan notifikasi di jam tertentu'}
                    </p>
                  </div>
                  <Switch checked={quietOn} label="Jam tenang" onChange={toggleQuiet} />
                </div>

                {quietOn && (
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                    {([['quiet_start', 'Mulai'], ['quiet_end', 'Selesai']] as const).map(([key, label]) => (
                      <label key={key} className="space-y-1">
                        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
                        <select
                          value={prefs[key] ?? 0}
                          onChange={(e) => setQuietHour(key, Number(e.target.value))}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
                        >
                          {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                        </select>
                      </label>
                    ))}
                    <p className="col-span-2 text-[11px] leading-relaxed text-ink-muted">
                      Waktu Jakarta (WIB). Notifikasi yang datang di jam tenang tidak dikirim, termasuk pengumuman dari admin.
                      Pengingat kalender dan kabar surat yang sudah bisa dibuka tetap dikirim, karena hanya dikirim sekali sehari (pukul 07.00 WIB).
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
