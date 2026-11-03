'use client'

import { useState, useEffect, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'

interface MissYouButtonProps {
  myId: string
  myName: string
  partnerId: string | null
  partnerName?: string | null
  coupleId: string | null
}

const COOLDOWN_MINUTES = 30
const MAX_PER_DAY = 10

function formatCountdown(ms: number): string {
  const totalMins = Math.ceil(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Same Jakarta calendar day as now (the daily limit resets at 00:00 WIB) */
function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  return todayJakarta(new Date(dateStr)) === todayJakarta()
}

export default function MissYouButton({ myId, myName, partnerId, partnerName, coupleId }: MissYouButtonProps) {
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pushStatus, setPushStatus] = useState<'idle' | 'sent' | 'no_sub'>('idle')
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null) // timestamp ms
  const [usedToday, setUsedToday] = useState(0)
  const [loading, setLoading] = useState(true)
  const [repliedAt, setRepliedAt] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // countdown timer
  useEffect(() => {
    if (!cooldownUntil) return
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  const loadStatus = useCallback(async () => {
    if (!coupleId) { setLoading(false); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('miss_you')
      .select('created_at, responded, responded_at')
      .eq('sender_id', myId)
      .order('created_at', { ascending: false })
      .limit(10)

    const rows = data ?? []
    const todayCount = rows.filter(r => isToday(r.created_at)).length
    setUsedToday(todayCount)

    // The partner answered my latest Kangen ("Miss you too") in the last day
    const answered = rows[0]?.responded && rows[0].responded_at
      && Date.now() - new Date(rows[0].responded_at).getTime() < 24 * 3600000
    setRepliedAt(answered ? rows[0].responded_at : null)

    const latest = rows[0]
    if (latest) {
      const latestMs = new Date(latest.created_at!).getTime()
      const cooldownEnd = latestMs + COOLDOWN_MINUTES * 60 * 1000
      if (cooldownEnd > Date.now()) {
        setCooldownUntil(cooldownEnd)
      } else {
        setCooldownUntil(null)
      }
    }
    setLoading(false)
  }, [myId, coupleId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const isCoolingDown = cooldownUntil !== null && cooldownUntil > Date.now()
  const isMaxedOut = usedToday >= MAX_PER_DAY
  const isDisabled = !partnerId || !coupleId || isCoolingDown || isMaxedOut || sending || loading

  async function handleTap() {
    if (isDisabled) return
    setSending(true)
    setSendError('')
    const supabase = createClient()

    // Server-side cooldown check: query last tap
    const { data: recent } = await supabase
      .from('miss_you')
      .select('created_at')
      .eq('sender_id', myId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent?.created_at) {
      const latestMs = new Date(recent.created_at).getTime()
      const cooldownEnd = latestMs + COOLDOWN_MINUTES * 60 * 1000
      if (cooldownEnd > Date.now()) {
        setCooldownUntil(cooldownEnd)
        setSending(false)
        return
      }
    }

    // Insert
    const { error } = await supabase.from('miss_you').insert({
      couple_id: coupleId!,
      sender_id: myId,
      receiver_id: partnerId!,
    })

    if (error) {
      setSendError("Your Kangen didn't go through. Try again.")
    } else {
      setJustSent(true)
      setRepliedAt(null)
      setCooldownUntil(Date.now() + COOLDOWN_MINUTES * 60 * 1000)
      setUsedToday(u => u + 1)
      setTimeout(() => setJustSent(false), 3000)

      // Send push notification
      try {
        const pushRes = await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: partnerId,
            title: 'Nanti Kita',
            body: `${myName} sent you a Kangen`,
            url: '/app/home',
            kind: 'kangen',
          }),
        })
        const pushData = await pushRes.json()
        setPushStatus(pushData.sent > 0 ? 'sent' : 'no_sub')
      } catch {
        setPushStatus('no_sub')
      }
    }
    setSending(false)
  }

  if (!coupleId) return null

  const remaining = MAX_PER_DAY - usedToday
  const cooldownMs = cooldownUntil ? cooldownUntil - Date.now() : 0

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Send a Kangen</span>
        {!isCoolingDown && !isMaxedOut && (
          <span className="text-xs text-ink-muted">{remaining} left today</span>
        )}
      </div>

      <button
        onClick={handleTap}
        disabled={isDisabled}
        className={`group relative w-full overflow-hidden rounded-2xl py-4 transition-all duration-200 active:scale-[0.97] ${
          isDisabled
            ? 'bg-cream border border-border cursor-not-allowed'
            : 'bg-gradient-to-r from-rose to-[#c45a7a] shadow-elevated'
        }`}
      >
        {/* Ripple animation when just sent */}
        {justSent && (
          <>
            <span className="absolute inset-0 animate-ping rounded-2xl bg-rose/30" />
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-rose/10" />
          </>
        )}

        <div className="relative flex items-center justify-center gap-3">
          <Heart
            className={`h-5 w-5 transition-all duration-300 ${
              isDisabled
                ? 'text-ink-muted'
                : justSent
                ? 'text-white scale-125 fill-white'
                : 'text-white group-hover:scale-110'
            }`}
            fill={justSent ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
          <span className={`text-sm font-bold ${isDisabled ? 'text-ink-muted' : 'text-white'}`}>
            {justSent
              ? 'Sent'
              : isCoolingDown
              ? `Send again in ${formatCountdown(cooldownMs)}`
              : isMaxedOut
              ? "That's all for today"
              : sending
              ? 'Sending...'
              : 'Kangen'}
          </span>
        </div>
      </button>

      {justSent && (
        <p className="mt-1.5 text-center text-xs animate-fade-in">
          {pushStatus === 'sent' ? (
            <span className="text-sage-dark">Your partner got a notification</span>
          ) : pushStatus === 'no_sub' ? (
            <span className="text-ink-muted">Kangen sent. Your partner hasn&apos;t turned on notifications yet.</span>
          ) : (
            <span className="text-ink-muted">Sending...</span>
          )}
        </p>
      )}
      {sendError && (
        <p className="mt-1.5 text-center text-xs font-medium text-red-500">{sendError}</p>
      )}
      {!justSent && repliedAt && (
        <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-xs font-semibold text-rose animate-fade-in">
          <Heart className="h-3 w-3" fill="currentColor" /> {partnerName ?? 'Your partner'} misses you too
        </p>
      )}
    </div>
  )
}
