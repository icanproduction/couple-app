'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Lock, Mail, MailOpen } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'

// Metadata only. `content` is not selectable by clients: it comes from the
// read_letter() RPC, which refuses the receiver until unlock_date.
interface LetterMeta {
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
  birthday: 'Birthday',
  wedding_day: 'Wedding day',
  milestone: 'Milestone',
  new_year: 'New Year',
  custom: 'Special letter',
}

// setTimeout can't wait longer than ~24.8 days
const MAX_TIMEOUT_MS = 2_147_000_000

function formatWIB(isoStr: string, withTime = true): string {
  return new Date(isoStr).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }) + (withTime ? ' WIB' : '')
}

function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, ms)
  return {
    days: Math.floor(total / 86400000),
    hours: Math.floor((total % 86400000) / 3600000),
    minutes: Math.floor((total % 3600000) / 60000),
  }
}

function CountdownDisplay({ msLeft }: { msLeft: number }) {
  const { days, hours, minutes } = splitDuration(msLeft)
  if (days > 0) return <p className="mt-2 text-2xl font-extrabold text-rose">{days} {days === 1 ? 'day' : 'days'}, {hours} h left</p>
  if (hours > 0) return <p className="mt-2 text-2xl font-extrabold text-rose">{hours} h {minutes} min left</p>
  if (minutes > 0) return <p className="mt-2 text-2xl font-extrabold text-rose">{minutes} min left</p>
  return <p className="mt-2 text-2xl font-extrabold text-rose">Any minute now</p>
}

// read_letter() raises "locked" / "not found" (English SQL) or "terkunci" /
// "tidak ditemukan" (older SQL). Accept both while versions are mixed.
function readErrorMessage(message: string | undefined): string {
  const isLocked =
    message?.includes('locked') ||
    message?.includes('terkunci')
  if (isLocked) return 'This letter is still locked. Try again a little later.'
  const isMissing =
    message?.includes('not found') ||
    message?.includes('tidak ditemukan')
  if (isMissing) return "We couldn't find this letter."
  return "Couldn't open the letter. Try again."
}

export default function LetterDetailPage() {
  const router = useRouter()
  const { letterId } = useParams<{ letterId: string }>()

  const [letter, setLetter] = useState<LetterMeta | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('your partner')
  const [receiverName, setReceiverName] = useState('your partner')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [justOpened, setJustOpened] = useState(false)
  const [readError, setReadError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const readContent = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('read_letter', { p_letter_id: id })
    const row = data?.[0]
    if (error || !row) {
      setReadError(readErrorMessage(error?.message))
      return false
    }
    setReadError('')
    setContent(row.content)
    setLetter(prev => prev ? { ...prev, is_opened: row.is_opened, opened_at: row.opened_at } : prev)
    return true
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setMyId(user.id)

    const { data } = await supabase
      .from('letters')
      .select('id, sender_id, receiver_id, occasion, occasion_label, unlock_date, is_opened, opened_at, created_at')
      .eq('id', letterId)
      .maybeSingle()
    if (!data) { setLoading(false); return }
    setLetter(data)

    const { data: people } = await supabase
      .from('profiles').select('id, name').in('id', [data.sender_id, data.receiver_id])
    const nameOf = (id: string) => people?.find(p => p.id === id)?.name
    setSenderName(nameOf(data.sender_id) ?? 'your partner')
    setReceiverName(nameOf(data.receiver_id) ?? 'your partner')

    // The sender can always read their own letter; the receiver reads it here
    // only once it was already opened (opening is an explicit tap below).
    if (data.sender_id === user.id || data.is_opened) await readContent(data.id)
    setLoading(false)
  }, [letterId, router, readContent])

  useEffect(() => { loadData() }, [loadData])

  // Tick so the countdown moves and the letter flips to "unlocked" at 0 (F71)
  const unlockMs = letter ? new Date(letter.unlock_date).getTime() : null
  useEffect(() => {
    if (unlockMs == null || unlockMs <= Date.now()) return
    const interval = setInterval(() => setNow(Date.now()), 30000)
    const wake = setTimeout(() => setNow(Date.now()), Math.min(unlockMs - Date.now() + 500, MAX_TIMEOUT_MS))
    return () => { clearInterval(interval); clearTimeout(wake) }
  }, [unlockMs])

  // Hide the "Letter opened!" overlay after a moment
  useEffect(() => {
    if (!justOpened) return
    const t = setTimeout(() => setJustOpened(false), 2500)
    return () => clearTimeout(t)
  }, [justOpened])

  async function openLetter() {
    if (!letter || opening) return
    setOpening(true)
    const ok = await readContent(letter.id)
    if (ok) setJustOpened(true)
    setOpening(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  if (!letter) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-sm text-ink-muted">We couldn&apos;t find this letter.</p>
        <button onClick={() => router.push('/app/letters')} className="mt-4 text-sm text-rose">Back to Letters</button>
      </div>
    )
  }

  const msLeft = new Date(letter.unlock_date).getTime() - now
  const isUnlocked = msLeft <= 0
  const isMine = letter.sender_id === myId
  const isOpened = !!letter.is_opened
  const occasion = letter.occasion ? (OCCASION_LABELS[letter.occasion] ?? 'Letter') : 'Letter'
  const daysLeft = Math.ceil(msLeft / 86400000)

  const backButton = (
    <button onClick={() => router.push('/app/letters')} className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
      <ArrowLeft className="h-4 w-4" /> Letters
    </button>
  )

  const contentCard = content != null && (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-card">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink font-[Georgia,serif]">
        {content}
      </p>
    </div>
  )

  // ===== Sender view: status + their own words =====
  if (isMine) {
    return (
      <div className="animate-fade-in pb-8">
        <div className="border-b border-border bg-white px-6 py-5">
          {backButton}
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{occasion}</p>
          <h1 className="mt-1 text-xl font-bold text-ink">Your letter to {receiverName}</h1>
          {letter.created_at && (
            <p className="mt-0.5 text-xs text-ink-muted">Written on {formatWIB(letter.created_at, false)}</p>
          )}
        </div>
        <div className="space-y-4 px-6 pt-6">
          <div className="rounded-2xl border border-border bg-cream px-6 py-4 text-center">
            {isOpened ? (
              <>
                <MailOpen className="mx-auto mb-2 h-5 w-5 text-sage-dark" />
                <p className="text-sm font-semibold text-ink">Read by {receiverName}</p>
                {letter.opened_at && <p className="mt-1 text-xs text-ink-muted">{formatWIB(letter.opened_at)}</p>}
              </>
            ) : isUnlocked ? (
              <>
                <Mail className="mx-auto mb-2 h-5 w-5 text-rose" />
                <p className="text-sm font-semibold text-ink">Ready to open</p>
                <p className="mt-1 text-xs text-ink-muted">Waiting for {receiverName} to read it</p>
              </>
            ) : (
              <>
                <Lock className="mx-auto mb-2 h-5 w-5 text-ink-muted" />
                <p className="text-sm text-ink-muted">Opens for {receiverName} on</p>
                <p className="mt-1 text-base font-bold text-ink">{formatWIB(letter.unlock_date)}</p>
                <p className="mt-1 text-xs font-semibold text-rose">{daysLeft > 1 ? `${daysLeft} days left` : 'Less than a day left'}</p>
              </>
            )}
          </div>
          {readError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{readError}</p>}
          {contentCard}
          <p className="text-center text-xs text-ink-muted">
            Locked letters can&apos;t be edited or deleted.
          </p>
        </div>
      </div>
    )
  }

  // ===== Receiver view: still locked =====
  if (!isUnlocked) {
    return (
      <div className="animate-fade-in pb-8">
        <div className="border-b border-border bg-white px-6 py-5">{backButton}</div>
        <div className="px-6 pt-8 flex flex-col items-center text-center">
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl ${daysLeft <= 7 ? 'bg-rose/10 shadow-glow' : 'bg-cream'}`}>
            <Lock className={`h-10 w-10 ${daysLeft <= 7 ? 'text-rose' : 'text-ink-muted'}`} />
          </div>
          <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{occasion}</p>
          <p className="mt-2 text-lg font-bold text-ink">From {senderName}</p>
          <div className="mt-4 w-full rounded-2xl bg-rose/5 border border-rose/20 px-6 py-5 text-center">
            <p className="text-sm text-ink-muted">Locked until</p>
            <p className="mt-1 text-xl font-bold text-ink">{formatWIB(letter.unlock_date)}</p>
            <CountdownDisplay msLeft={msLeft} />
          </div>
          {daysLeft <= 7 && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm font-semibold text-amber-700">Almost time</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {daysLeft > 1 ? `This letter opens in ${daysLeft} days` : 'This letter opens in less than a day'}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== Receiver view: unlocked (ready to open, or already read) =====
  return (
    <div className="animate-fade-in pb-8">
      {justOpened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-elevated">
              <MailOpen className="h-8 w-8 text-rose" />
            </div>
            <p className="text-lg font-bold text-white bg-rose/80 px-4 py-2 rounded-full backdrop-blur-sm">Letter opened!</p>
          </div>
        </div>
      )}

      <div className="border-b border-border bg-white px-6 py-5">
        {backButton}
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{occasion}</p>
        <h1 className="text-xl font-bold text-ink mt-1">From {senderName}</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          {letter.created_at && `Written on ${formatWIB(letter.created_at, false)}`}
          {letter.opened_at && ` · Opened on ${formatWIB(letter.opened_at)}`}
        </p>
      </div>

      {!isOpened && content == null && (
        <div className="mx-6 mt-6 rounded-2xl bg-gradient-to-br from-rose/10 to-rose/5 border border-rose/30 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose/10">
            <MailOpen className="h-7 w-7 text-rose" />
          </div>
          <p className="text-base font-bold text-ink">Your letter is ready to open</p>
          <p className="mt-1 text-sm text-ink-muted">From {senderName}, just for you</p>
          <button
            onClick={openLetter}
            disabled={opening}
            className="mt-4 w-full rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {opening ? 'Opening...' : 'Open letter'}
          </button>
        </div>
      )}

      {readError && (
        <p className="mx-6 mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{readError}</p>
      )}

      {contentCard && (
        <div className="mx-6 mt-6">
          {contentCard}
          {letter.opened_at && (
            <p className="mt-3 text-center text-xs text-ink-muted">
              Read on {formatWIB(letter.opened_at)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
