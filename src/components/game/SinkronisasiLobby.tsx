'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Bell, Check, X } from 'lucide-react'

interface SinkronisasiLobbyProps {
  myName: string
  myAvatar: string | null
  partnerName: string
  partnerAvatar: string | null
  isPartnerConnected: boolean
  isMyReady: boolean
  isPartnerReady: boolean
  onReady: () => void
  onClose: () => void
  chapterTitle?: string
  sessionId: string
  partnerId: string | null
}

function Avatar({ src, name }: { src: string; name: string }) {
  // Avatars live in Supabase Storage (any project host), so skip the optimizer.
  return <Image src={src} alt={name} fill sizes="80px" unoptimized className="object-cover" />
}

export default function SinkronisasiLobby({
  myName, myAvatar, partnerName, partnerAvatar,
  isPartnerConnected, isMyReady, isPartnerReady, onReady, onClose,
  chapterTitle, sessionId, partnerId,
}: SinkronisasiLobbyProps) {
  const [notifSent, setNotifSent] = useState(false)
  const [notifSending, setNotifSending] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)

  async function sendReminder() {
    if (!partnerId || notifSent || notifSending) return
    setNotifSending(true)
    setNotifError(null)
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: 'Nanti Kita',
          body: `${myName} is waiting to play Samakan with you. Jump in now.`,
          url: `/app/games/samakan/${sessionId}`,
          kind: 'activity',
        }),
      })
      if (res.ok) {
        setNotifSent(true)
      } else {
        const json = await res.json().catch(() => ({}))
        setNotifError(json.error ?? "Couldn't send the notification")
      }
    } catch {
      setNotifError("Couldn't send the notification")
    }
    setNotifSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-ink to-gray-900 px-6">
      <button
        onClick={onClose}
        aria-label="Leave the lobby"
        className="absolute right-4 top-4 rounded-full p-2 transition-colors hover:bg-white/10 active:scale-95"
      >
        <X className="h-5 w-5 text-white/60" />
      </button>

      <h2 className="mb-2 text-2xl font-bold text-white">Samakan</h2>
      <p className="mb-10 text-sm text-white/60">
        {chapterTitle ? `Chapter: ${chapterTitle}` : 'Get ready to play together'}
      </p>

      <div className="flex items-center gap-8 mb-12">
        {/* My avatar */}
        <div className="flex flex-col items-center gap-2">
          <div
            className={`relative h-20 w-20 rounded-full border-4 overflow-hidden flex items-center justify-center text-2xl font-bold text-white ${
              isMyReady ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/30 bg-white/10'
            }`}
          >
            {myAvatar ? <Avatar src={myAvatar} name={myName} /> : myName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-white">{myName}</span>
          {isMyReady && (
            <span className="text-xs font-bold text-emerald-400">READY</span>
          )}
        </div>

        {/* VS */}
        <div className="text-white/30 text-lg font-bold">&</div>

        {/* Partner avatar */}
        <div className="flex flex-col items-center gap-2">
          <div
            className={`relative h-20 w-20 rounded-full border-4 overflow-hidden flex items-center justify-center text-2xl font-bold text-white ${
              isPartnerReady
                ? 'border-emerald-400 bg-emerald-500/20'
                : isPartnerConnected
                ? 'border-white/30 bg-white/10'
                : 'border-white/20 bg-white/5 animate-pulse'
            }`}
          >
            {isPartnerConnected ? (
              partnerAvatar ? <Avatar src={partnerAvatar} name={partnerName} /> : partnerName.charAt(0).toUpperCase()
            ) : (
              <span className="text-white/30 text-3xl">?</span>
            )}
          </div>
          <span className="text-sm font-medium text-white">
            {isPartnerConnected ? partnerName : 'Waiting...'}
          </span>
          {isPartnerReady && (
            <span className="text-xs font-bold text-emerald-400">READY</span>
          )}
          {!isPartnerConnected && (
            <span className="text-xs text-white/40">Not here yet</span>
          )}
        </div>
      </div>

      {/* Ready button */}
      {!isMyReady ? (
        <button
          onClick={onReady}
          disabled={!isPartnerConnected}
          className={`rounded-full px-10 py-3 text-lg font-bold transition-all ${
            isPartnerConnected
              ? 'bg-rose text-white active:scale-95 shadow-lg shadow-rose/30'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          I&apos;m ready
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-rose animate-spin" />
          <p className="text-sm text-white/50">
            {isPartnerConnected ? 'Waiting for your partner to get ready...' : 'Waiting for your partner to join...'}
          </p>
        </div>
      )}

      {/* Notify partner button — shown when partner hasn't joined */}
      {!isPartnerConnected && partnerId && (
        <button
          onClick={sendReminder}
          disabled={notifSent || notifSending}
          className={`mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
            notifSent
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {notifSent ? (
            <>
              <Check className="h-4 w-4" />
              Notification sent
            </>
          ) : (
            <>
              <Bell className="h-4 w-4" />
              {notifSending ? 'Sending...' : 'Call your partner'}
            </>
          )}
        </button>
      )}

      {notifError && !isPartnerConnected && (
        <p className="mt-3 text-xs text-red-300 text-center max-w-xs">{notifError}</p>
      )}

      {!isPartnerConnected && !partnerId && (
        <p className="mt-6 text-xs text-white/30 text-center max-w-xs">
          Your partner will get a notification. They can join from the same link.
        </p>
      )}
    </div>
  )
}
