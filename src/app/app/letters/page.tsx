'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Lock, MailOpen, Mail, ChevronRight, Clock, BookOpen, Inbox, PenLine } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'

interface Letter {
  id: string
  sender_id: string
  receiver_id: string
  occasion: string | null
  occasion_label: string | null
  unlock_date: string
  is_opened: boolean | null
  opened_at: string | null
  created_at: string | null
}

const OCCASION_LABELS: Record<string, string> = {
  anniversary: 'Anniversary',
  birthday: 'Ulang Tahun',
  wedding_day: 'Hari Nikah',
  milestone: 'Milestone',
  new_year: 'Tahun Baru',
  custom: 'Surat Spesial',
}

function msUntil(isoStr: string): number {
  return new Date(isoStr).getTime() - Date.now()
}

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

function countdownLabel(isoStr: string): string {
  const ms = msUntil(isoStr)
  if (ms <= 0) return 'Sudah terbuka'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  if (days > 0) return `${days} hari ${hours} jam lagi`
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours} jam ${mins} menit lagi`
  return `${mins} menit lagi`
}

export default function LettersPage() {
  const router = useRouter()
  const [myId, setMyId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState<string>('Pasangan')
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'diterima' | 'dikirim'>('diterima')
  const [loadError, setLoadError] = useState('')
  // Re-render every minute so countdowns tick and unlocked letters flip state
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setMyId(user.id)

    const { data: membership } = await supabase.from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) { setLoading(false); return }

    const { data: partnerMembers } = await supabase.from('couple_members').select('profile_id').eq('couple_id', membership.couple_id).neq('profile_id', user.id)
    if (partnerMembers?.[0]) {
      const { data: pp } = await supabase.from('profiles').select('name').eq('id', partnerMembers[0].profile_id).single()
      if (pp?.name) setPartnerName(pp.name)
    }

    // Never select `content` here: it is only readable through read_letter()
    // once the letter is unlocked (the column is not granted to clients).
    const { data, error } = await supabase
      .from('letters')
      .select('id, sender_id, receiver_id, occasion, occasion_label, unlock_date, is_opened, opened_at, created_at')
      .eq('couple_id', membership.couple_id)
      .order('unlock_date', { ascending: true })

    if (error) setLoadError('Gagal memuat surat. Coba muat ulang halaman.')
    setLetters((data ?? []) as Letter[])
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const received = letters.filter(l => l.receiver_id === myId)
  const sent = letters.filter(l => l.sender_id === myId)
  const displayed = tab === 'diterima' ? received : sent

  // Badge: letters ready to open (unlocked but not opened yet)
  const readyToOpen = received.filter(l => msUntil(l.unlock_date) <= 0 && !l.is_opened).length
  // Badge: letters unlocking within 24h
  const soonUnlocking = received.filter(l => {
    const ms = msUntil(l.unlock_date)
    return ms > 0 && ms <= 86400000 * 7 && !l.is_opened
  }).length

  function renderLetter(letter: Letter) {
    const ms = msUntil(letter.unlock_date)
    const isUnlocked = ms <= 0
    const isMine = letter.sender_id === myId
    const isOpened = !!letter.is_opened
    // Only the receiver gets the "ready to open" highlight
    const isReady = isUnlocked && !isOpened && !isMine
    const daysLeft = Math.ceil(ms / 86400000)

    const occasion = letter.occasion ? (OCCASION_LABELS[letter.occasion] ?? 'Surat') : 'Surat Rahasia'

    return (
      <button
        key={letter.id}
        onClick={() => isUnlocked || isMine ? router.push(`/app/letters/${letter.id}`) : undefined}
        className={`flex w-full items-start gap-4 rounded-2xl border bg-white p-4 text-left shadow-card transition-all ${
          isReady ? 'border-rose/40 hover:border-rose' :
          isUnlocked ? 'border-border hover:border-sage' :
          isMine ? 'border-border hover:border-border/60' :
          'border-border cursor-default'
        }`}
      >
        {/* Envelope icon */}
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-all ${
          isReady ? 'bg-rose/10 animate-pulse' :
          isUnlocked ? 'bg-sage/10' :
          'bg-cream'
        }`}>
          {isReady
            ? <MailOpen className="h-5 w-5 text-rose" />
            : isUnlocked
            ? <BookOpen className="h-5 w-5 text-sage-dark" />
            : <Lock className="h-5 w-5 text-ink-muted" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-xs font-semibold text-ink-muted">{occasion}</p>
            {isReady && (
              <span className="rounded-full bg-rose px-2 py-0.5 text-[10px] font-bold text-white">BUKA!</span>
            )}
            {!isUnlocked && !isMine && daysLeft <= 7 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{countdownLabel(letter.unlock_date)}</span>
            )}
          </div>
          <p className="text-sm font-bold text-ink">
            {isMine ? `Untuk ${partnerName}` : `Dari ${partnerName}`}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {isUnlocked ? (
              isOpened
                ? (letter.opened_at
                    ? `${isMine ? `Dibaca ${partnerName}` : 'Dibuka'} ${formatWIB(letter.opened_at)}`
                    : isMine ? `Sudah dibaca ${partnerName}` : 'Sudah dibuka')
                : isMine ? `Sudah terbuka · belum dibaca ${partnerName}` : 'Bisa dibuka sekarang!'
            ) : (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>{formatWIB(letter.unlock_date)} · {countdownLabel(letter.unlock_date)}</span>
              </span>
            )}
          </p>
        </div>

        {(isUnlocked || isMine) && <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted mt-1" />}
      </button>
    )
  }

  const badgeCount = readyToOpen > 0 ? readyToOpen : soonUnlocking

  return (
    <div className="animate-fade-in pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">Surat Rahasia</h1>
            <p className="text-sm text-ink-muted">Pesan terkunci untuk momen spesial</p>
          </div>
          <button
            onClick={() => router.push('/app/letters/tulis')}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-rose px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            <Plus className="h-4 w-4" /> Tulis
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-white px-6">
        {(['diterima', 'dikirim'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold transition-colors capitalize ${
              tab === t ? 'border-rose text-rose' : 'border-transparent text-ink-muted'
            }`}
          >
            {t === 'diterima' ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {t === 'diterima' ? 'Untukku' : 'Dariku'}
            {t === 'diterima' && badgeCount > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose text-[10px] font-bold text-white">{badgeCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-6 pt-5">
        {loadError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>
        )}
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cream">
              {tab === 'diterima' ? <Inbox className="h-6 w-6 text-ink-muted" /> : <PenLine className="h-6 w-6 text-ink-muted" />}
            </div>
            <p className="text-sm font-semibold text-ink">
              {tab === 'diterima' ? 'Belum ada surat untukmu' : 'Belum ada surat yang kamu tulis'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {tab === 'diterima'
                ? 'Minta pasangan menulis surat rahasia untukmu!'
                : 'Tulis surat pertama untuk pasanganmu sekarang'}
            </p>
            {tab === 'dikirim' && (
              <button
                onClick={() => router.push('/app/letters/tulis')}
                className="mt-4 rounded-xl bg-rose px-4 py-2 text-sm font-bold text-white"
              >
                Tulis Surat
              </button>
            )}
          </div>
        ) : (
          displayed.map(renderLetter)
        )}
      </div>
    </div>
  )
}
