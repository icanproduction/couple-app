'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'

const OCCASIONS = [
  { value: 'anniversary', label: 'Anniversary', desc: 'Tulis sesuatu untuk hari jadi kalian' },
  { value: 'birthday', label: 'Ulang Tahun', desc: 'Surprise di hari ulang tahun pasangan' },
  { value: 'wedding_day', label: 'Hari Nikah', desc: 'Surat untuk dibaca di hari pernikahan' },
  { value: 'milestone', label: 'Milestone', desc: '1000 hari, 3 tahun, atau pencapaian lain' },
  { value: 'new_year', label: 'Tahun Baru', desc: 'Resolusi dan harapan bersama' },
  { value: 'custom', label: 'Bebas', desc: 'Kapan saja kamu pilih' },
]

const MAX_CHARS = 2000
/**
 * Build a timestamptz string from a WIB date ("YYYY-MM-DD") + hour (0-23 WIB).
 * Returns null while the date input is empty or incomplete — the date field can
 * be cleared, and `new Date('T..')` would throw on toISOString().
 */
function buildUnlockTimestamp(dateStr: string, hour: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const date = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Format a timestamptz for display in WIB */
function formatWIB(isoStr: string): string {
  return new Date(isoStr).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB'
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00`,
}))

export default function WriteLetter() {
  const router = useRouter()
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('Pasangan')
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)

  const [occasion, setOccasion] = useState('anniversary')
  const [unlockDate, setUnlockDate] = useState(() => todayJakarta())
  const [unlockHour, setUnlockHour] = useState(7) // 07:00 WIB default
  const [content, setContent] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)

  const minDate = todayJakarta()

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setMyId(user.id)

    const { data: membership } = await supabase.from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) return
    setCoupleId(membership.couple_id)

    const { data: partnerMembers } = await supabase.from('couple_members').select('profile_id').eq('couple_id', membership.couple_id).neq('profile_id', user.id)
    if (partnerMembers?.[0]) {
      setPartnerId(partnerMembers[0].profile_id)
      const { data: pp } = await supabase.from('profiles').select('name').eq('id', partnerMembers[0].profile_id).single()
      if (pp?.name) setPartnerName(pp.name)
    }

    // select('id') — `*` would include the non-granted `content` column and fail
    const { count } = await supabase.from('letters').select('id', { count: 'exact', head: true }).eq('sender_id', user.id).eq('is_opened', false)
    setPendingCount(count ?? 0)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const unlockTimestamp = buildUnlockTimestamp(unlockDate, unlockHour)
  const unlockInPast = unlockTimestamp != null && new Date(unlockTimestamp) <= new Date()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!content.trim()) { setError('Tulis isi suratnya dulu ya'); return }
    if (content.length > MAX_CHARS) { setError('Surat terlalu panjang (maks 2000 karakter)'); return }
    if (pendingCount >= 10) { setError('Kamu sudah punya 10 surat terkunci. Tunggu beberapa surat terbuka dulu'); return }
    if (!partnerId || !coupleId || !myId) { setError('Belum terhubung dengan pasangan'); return }
    if (!unlockTimestamp) { setError('Pilih tanggal buka suratnya dulu'); return }

    // Validate unlock time is not in the past
    if (new Date(unlockTimestamp) <= new Date()) {
      setError('Waktu buka harus di masa depan')
      return
    }

    setSubmitting(true)
    const supabase = createClient()

    const { error: insertError } = await supabase.from('letters').insert({
      couple_id: coupleId,
      sender_id: myId,
      receiver_id: partnerId,
      content: content.trim(),
      occasion,
      unlock_date: unlockTimestamp,
    })

    if (insertError) { setError(insertError.message); setSubmitting(false); return }

    // Notify partner
    try {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: 'Nanti Kita',
          body: `Kamu punya surat yang bisa dibuka ${formatWIB(unlockTimestamp)}`,
          url: '/app/letters',
          kind: 'letters',
        }),
      })
    } catch { /* optional */ }

    setLockedUntil(unlockTimestamp)
    setSubmitting(false)
  }

  if (lockedUntil) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center animate-fade-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
          <Lock className="h-8 w-8 text-rose" />
        </div>
        <h2 className="text-2xl font-bold text-ink">Surat Terkunci!</h2>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">
          Suratmu untuk {partnerName} sudah tersimpan dan terkunci.<br />
          Mereka bisa membacanya pada{' '}
          <span className="font-semibold text-rose">{formatWIB(lockedUntil)}</span>.
        </p>
        <button
          onClick={() => router.push('/app/letters')}
          className="mt-8 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
        >
          Lihat Kotak Surat
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 py-5">
        <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Surat Rahasia
        </button>
        <h1 className="text-xl font-bold text-ink">Tulis Surat untuk {partnerName}</h1>
        <p className="text-sm text-ink-muted">Akan terkunci sampai waktu yang kamu pilih</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 px-6 pt-5">
        {/* Occasion */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Untuk Apa Surat Ini?</p>
          <div className="grid grid-cols-2 gap-2">
            {OCCASIONS.map(occ => (
              <button
                key={occ.value}
                type="button"
                onClick={() => setOccasion(occ.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  occasion === occ.value
                    ? 'border-rose bg-rose/5'
                    : 'border-border bg-white hover:border-rose/30'
                }`}
              >
                <p className="text-sm font-semibold text-ink">{occ.label}</p>
                <p className="mt-0.5 text-xs text-ink-muted leading-snug">{occ.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Unlock date + time */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Bisa Dibuka Mulai (Waktu Jakarta)
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={unlockDate}
              min={minDate}
              onChange={e => setUnlockDate(e.target.value)}
              aria-label="Tanggal surat bisa dibuka"
              className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink focus:border-rose focus:outline-none"
            />
            {/* The label above already says WIB; repeating it in each option
                cut the text off ("07:00 WIE") on narrow phones. */}
            <select
              value={unlockHour}
              onChange={e => setUnlockHour(Number(e.target.value))}
              aria-label="Jam surat bisa dibuka (WIB)"
              className="w-[6.5rem] shrink-0 rounded-xl border border-border bg-white px-3 py-3 text-sm text-ink focus:border-rose focus:outline-none"
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          {unlockTimestamp ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              Akan terbuka: <span className="font-medium text-ink">{formatWIB(unlockTimestamp)}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-rose font-medium">Pilih tanggal buka suratnya dulu</p>
          )}
          {unlockInPast && (
            <p className="mt-1 text-xs text-rose font-medium">⚠️ Waktu sudah lewat, pilih waktu yang akan datang</p>
          )}
        </div>

        {/* Content */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Isi Surat</label>
            <span className={`text-xs ${content.length > MAX_CHARS * 0.9 ? 'text-rose' : 'text-ink-muted'}`}>
              {content.length}/{MAX_CHARS}
            </span>
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`Tulis surat untuk ${partnerName}...\n\nCeritakan apa yang kamu rasakan, harapan, atau kenangan yang ingin kamu bagikan.`}
            rows={10}
            maxLength={MAX_CHARS}
            className="w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-relaxed text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {pendingCount >= 10 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Kamu sudah punya 10 surat terkunci. Tunggu beberapa surat terbuka dulu.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !content.trim() || pendingCount >= 10 || !unlockTimestamp || unlockInPast}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-4 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          {submitting ? 'Mengunci...' : 'Kunci Surat'}
        </button>

        <p className="text-center text-xs text-ink-muted">
          Setelah dikunci, surat tidak bisa diedit atau dihapus.
        </p>
      </form>
    </div>
  )
}
