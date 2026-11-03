'use client'

import { useState, useEffect, useCallback } from 'react'
import { Heart, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface MissYouToastProps {
  myId: string
  myName: string
  partnerId: string | null
  partnerName: string | null
  coupleId: string | null
}

interface MissYouRow {
  id: string
  sender_id: string
  responded: boolean | null
  created_at: string | null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit yang lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam yang lalu`
  return `${Math.floor(hours / 24)} hari yang lalu`
}

/**
 * Shows the partner's latest unanswered "Kangen" (last 24h) on home, with a
 * "Kangen kamu juga" reply. Replying marks it responded as the receiver (the
 * only update RLS allows) and pings the partner; it does not send a new
 * Kangen back, so it doesn't use up my own cooldown or start a ping-pong.
 */
export default function MissYouToast({ myId, myName, partnerId, partnerName, coupleId }: MissYouToastProps) {
  const [latestMissYou, setLatestMissYou] = useState<MissYouRow | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [responding, setResponding] = useState(false)
  const [responded, setResponded] = useState(false)
  const [error, setError] = useState('')

  const loadLatest = useCallback(async () => {
    if (!coupleId || !partnerId) return
    const supabase = createClient()

    // Most recent unanswered kangen FROM partner TO me
    const { data } = await supabase
      .from('miss_you')
      .select('id, sender_id, responded, created_at')
      .eq('couple_id', coupleId)
      .eq('sender_id', partnerId)
      .eq('receiver_id', myId)
      .eq('responded', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.created_at) {
      // Only show if within last 24 hours
      const ageHours = (Date.now() - new Date(data.created_at).getTime()) / 3600000
      if (ageHours < 24) setLatestMissYou(data)
    }
  }, [myId, partnerId, coupleId])

  useEffect(() => { loadLatest() }, [loadLatest])

  // Close a moment after replying
  useEffect(() => {
    if (!responded) return
    const t = setTimeout(() => setDismissed(true), 2500)
    return () => clearTimeout(t)
  }, [responded])

  async function handleRespond() {
    if (!latestMissYou || !partnerId || !coupleId || responding) return
    setResponding(true)
    setError('')
    const supabase = createClient()

    // Answer every pending kangen from the partner at once, so older ones
    // don't pop up again on the next visit
    const { error: updateError } = await supabase
      .from('miss_you')
      .update({ responded: true, responded_at: new Date().toISOString() })
      .eq('couple_id', coupleId)
      .eq('sender_id', partnerId)
      .eq('receiver_id', myId)
      .eq('responded', false)

    if (updateError) {
      setError('Gagal membalas. Coba lagi ya.')
      setResponding(false)
      return
    }

    // Push notif back
    try {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: '💓 Nanti Kita',
          body: `${myName} kangen kamu juga!`,
          url: '/app/home',
          kind: 'kangen',
        }),
      })
    } catch { /* optional */ }

    setResponded(true)
    setResponding(false)
  }

  if (!latestMissYou || dismissed) return null

  return (
    <div className="mx-4 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose/10 to-rose/5 border border-rose/20 p-4">
        <button
          onClick={() => setDismissed(true)}
          aria-label="Tutup"
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose/10 text-rose"
        >
          <X className="h-3 w-3" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose/20">
            <Heart className="h-5 w-5 text-rose" fill="currentColor" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">
              {partnerName ?? 'Pasangan'} kangen kamu
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              {timeAgo(latestMissYou.created_at)}
            </p>

            {responded ? (
              <p className="mt-2 text-xs font-semibold text-rose">Terkirim: kangen kamu juga!</p>
            ) : (
              <button
                onClick={handleRespond}
                disabled={responding}
                className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-rose px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.97] disabled:opacity-60"
              >
                <Heart className="h-3 w-3" fill="currentColor" />
                {responding ? 'Mengirim...' : 'Kangen kamu juga'}
              </button>
            )}
            {error && <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
