'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Camera, ChevronLeft, ChevronRight, CircleCheck, Gamepad2, Heart, HeartHandshake, Mail, MapPin,
  MessageSquareHeart, PiggyBank, RefreshCw, Share2, Sparkles,
} from 'lucide-react'
import { monthKeyJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { MOODS, MOOD_KEYS, type MoodKey } from '@/lib/mood'
import {
  earliestRecapMonth, loadRecap, monthLabelID, recapShareText, shiftMonth,
  type MonthRecap, type PartnerRecap,
} from '@/lib/recap'
import { cn, formatRupiah } from '@/lib/utils'

function StatTile({ icon: Icon, tone, value, label, sub }: {
  icon: typeof Heart
  tone: string
  value: string | number
  label: string
  sub?: string | null
}) {
  // Rupiah totals ("Rp 357.500.000") don't fit a half-width tile at text-xl;
  // step the size down by length and let it wrap rather than spill out.
  const text = String(value)
  const size = text.length > 13 ? 'text-sm' : text.length > 9 ? 'text-base' : 'text-xl'
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-white p-3.5 shadow-card">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <p className={cn('mt-2.5 font-bold leading-tight text-ink [overflow-wrap:anywhere]', size)}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-light">{label}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-ink-muted">{sub}</p>}
    </div>
  )
}

function MoodRow({ partner }: { partner: PartnerRecap }) {
  const entries = MOOD_KEYS
    .map((key) => ({ key, count: partner.moods[key] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">{partner.name}</p>
        <p className="shrink-0 whitespace-nowrap text-xs text-ink-muted">{partner.moodDays} hari check-in</p>
      </div>
      {entries.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-muted">Belum ada check-in mood bulan ini.</p>
      ) : (
        <>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
            {entries.map((e) => (
              <span key={e.key} style={{ width: `${(e.count / partner.moodDays) * 100}%`, backgroundColor: MOODS[e.key as MoodKey].color }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <li
                key={e.key}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: MOODS[e.key as MoodKey].soft, color: MOODS[e.key as MoodKey].color }}
              >
                {MOODS[e.key as MoodKey].emoji} {MOODS[e.key as MoodKey].label} · {e.count}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default function RecapPage() {
  const router = useRouter()
  const thisMonth = monthKeyJakarta()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [hasCouple, setHasCouple] = useState(true)
  const [month, setMonth] = useState(thisMonth)
  const [earliest, setEarliest] = useState<string | null>(null)
  const [recap, setRecap] = useState<MonthRecap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  /** Bumped by "Coba lagi": the couple lookup, or the month's recap */
  const [infoAttempt, setInfoAttempt] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const i = await getCoupleInfo()
        if (!i) { router.replace('/auth/login'); return }
        if (cancelled) return
        if (!i.coupleId) { setHasCouple(false); setLoading(false); return }
        setInfo(i)
        earliestRecapMonth(i).then((m) => { if (!cancelled) setEarliest(m) }).catch(() => {})
      } catch {
        if (!cancelled) { setError('Gagal memuat recap. Cek koneksi lalu coba lagi.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [router, infoAttempt])

  useEffect(() => {
    if (!info?.coupleId) return
    const id = ++requestId.current
    // Never show (or share) the previous month under this month's label
    setRecap(null)
    setLoading(true)
    setError('')
    loadRecap(info, month)
      .then((r) => { if (id === requestId.current) setRecap(r) })
      .catch(() => { if (id === requestId.current) setError('Gagal memuat recap bulan ini. Cek koneksi lalu coba lagi.') })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }, [info, month, attempt])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const canPrev = !earliest || month > earliest
  const canNext = month < thisMonth
  const label = monthLabelID(month)

  async function share() {
    if (!recap || !info) return
    const text = recapShareText(recap, info.names)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Recap ${label}`, text })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        // Otherwise fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setToast('Ringkasan disalin, tinggal tempel')
    } catch {
      setToast('Gagal membagikan recap')
    }
  }

  const totalMoods = recap?.partners.reduce((s, p) => s + p.moodDays, 0) ?? 0
  const maxKangen = Math.max(1, ...(recap?.partners.map((p) => p.kangenSent) ?? [0]))

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Recap Bulanan</h1>
            <p className="text-sm text-ink-muted">Cerita kalian sebulan, dalam angka</p>
          </div>
          {hasCouple && (
            <button
              type="button"
              onClick={share}
              disabled={!recap || loading}
              className="flex items-center gap-1.5 rounded-2xl bg-rose px-4 py-2.5 text-xs font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Share2 className="h-4 w-4" /> Bagikan
            </button>
          )}
        </div>
      </div>

      {!hasCouple ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Hubungkan akunmu dengan pasangan dulu untuk melihat recap kalian.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Profil</Link>
        </div>
      ) : (
        <div className="space-y-5 px-6 pt-5">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-white px-2 py-2 shadow-card">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              disabled={!canPrev}
              aria-label="Bulan sebelumnya"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-cream disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-ink">{label}</p>
              {month === thisMonth && <p className="text-[11px] text-ink-muted">Bulan berjalan</p>}
            </div>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={!canNext}
              aria-label="Bulan berikutnya"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-cream disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-4">
              <div className="aspect-[4/3] animate-pulse rounded-2xl bg-rose-50" />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-rose-50" />)}
              </div>
            </div>
          ) : error ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setError(''); setLoading(true)
                  if (info) setAttempt((n) => n + 1)
                  else setInfoAttempt((n) => n + 1)
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
              </button>
            </div>
          ) : recap ? (
            <>
              {recap.bestPhoto ? (
                <Link
                  href={`/app/moments/${recap.bestPhoto.momentId}`}
                  className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-rose-50 shadow-elevated"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                  <img src={recap.bestPhoto.url} alt={recap.bestPhoto.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-14">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">Foto bulan ini · {recap.bestPhoto.title}</p>
                    <p className="mt-1 text-lg font-bold leading-snug text-white">{recap.headline}</p>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl bg-gradient-to-br from-rose to-rose-dark p-5 text-white shadow-elevated">
                  <Sparkles className="h-6 w-6 text-white/80" />
                  <p className="mt-3 text-lg font-bold leading-snug">{recap.headline}</p>
                  <p className="mt-1 text-xs text-white/80">{label}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <StatTile icon={Camera} tone="bg-rose/10 text-rose" value={recap.moments} label="moment" sub={`${recap.photos} foto`} />
                <StatTile icon={MapPin} tone="bg-rose/10 text-rose" value={recap.places.length} label="tempat berbeda" sub={recap.places.slice(0, 2).join(', ') || null} />
                <StatTile icon={MessageSquareHeart} tone="bg-gold/20 text-gold-dark" value={recap.dailyBothDays} label="hari kompak" sub="kalian berdua menjawab" />
                <StatTile icon={CircleCheck} tone="bg-sage/20 text-sage-dark" value={recap.bucketDone} label="impian tercentang" sub={recap.bucketDoneTitles[0] ?? null} />
                <StatTile icon={Mail} tone="bg-purple-100 text-purple-600" value={recap.lettersWritten} label="surat ditulis" />
                <StatTile icon={HeartHandshake} tone="bg-gold/20 text-gold-dark" value={recap.gratitudeNotes} label="apresiasi di toples" />
                <StatTile icon={Gamepad2} tone="bg-blue-50 text-blue-600" value={recap.gamesCompleted} label="game Samakan selesai" />
                <StatTile
                  icon={PiggyBank}
                  tone="bg-sage/20 text-sage-dark"
                  value={formatRupiah(recap.savingsIn)}
                  label="ditabung"
                  sub={recap.savingsOut ? `ditarik ${formatRupiah(recap.savingsOut)}` : null}
                />
              </div>

              <section className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink"><Heart className="h-4 w-4 text-rose" /> Kangen</h2>
                  <p className="text-xs text-ink-muted">{recap.kangenTotal}x total</p>
                </div>
                <div className="mt-3 space-y-3">
                  {recap.partners.map((p) => (
                    <div key={p.id}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate font-semibold text-ink">{p.name}</span>
                        <span className="shrink-0 whitespace-nowrap text-ink-muted">kirim {p.kangenSent}x · terima {p.kangenReceived}x</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rose-50" aria-hidden="true">
                        <div className="h-full rounded-full bg-rose" style={{ width: `${(p.kangenSent / maxKangen) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <h2 className="text-sm font-bold text-ink">Mood kalian</h2>
                {totalMoods === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">Belum ada check-in mood bulan ini.</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    {recap.partners.map((p) => <MoodRow key={p.id} partner={p} />)}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-elevated">
          {toast}
        </div>
      )}
    </div>
  )
}
