'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, MessageCircle, Check } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { getMyCouple } from '@/lib/couple'
import { Button } from '@/components/ui/Button'
import { InviteExpiry } from '@/components/account/InviteExpiry'

export default function OnboardingInvitePage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadInviteCode() {
      const supabase = createClient()
      const user = await getClientUser()
      if (!user) { router.replace('/auth/login'); return }

      try {
        const couple = await getMyCouple(user.id)
        if (cancelled) return
        // Nothing to share without a couple; nothing left to share once the
        // partner has joined.
        if (!couple) { router.replace('/onboarding/couple'); return }
        if (couple.memberCount >= 2) { router.replace('/onboarding/install'); return }
        // Partner left: the couple is a closed archive with no invite code.
        // Profile explains it and offers a fresh start.
        if (couple.closedAt) { router.replace('/app/profile'); return }
        setInviteCode(couple.inviteCode)
        setExpiresAt(couple.inviteExpiresAt)
        // The link always points at the site the user is on right now.
        setInviteLink(`${window.location.origin}/invite/${couple.inviteCode}`)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Couldn\'t load your invite code')
      }
      setLoading(false)
    }
    loadInviteCode()
    return () => { cancelled = true }
  }, [router])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Couldn\'t copy it. Copy the link above by hand.')
    }
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      `Hey, join me on Nanti Kita.\n\nTap this link to join right away:\n${inviteLink}\n\nOr enter the code: *${inviteCode}*`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  if (!inviteCode) {
    return (
      <div className="animate-fade-in py-10 text-center">
        <p className="mb-6 text-sm text-danger">{error || 'Your invite code isn\'t ready yet.'}</p>
        <Button onClick={() => window.location.reload()} variant="secondary" size="lg">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Invite your partner</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Send this code to your partner so they can join
        </p>
      </div>

      {/* Invite code display */}
      <div className="mb-6 rounded-2xl border border-rose/20 bg-rose-50 p-6 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Invite code
        </p>
        <p className="font-mono text-4xl font-bold tracking-[0.3em] text-rose">
          {inviteCode}
        </p>
        <p className="mt-3 break-all text-xs text-ink-muted">{inviteLink}</p>
        {expiresAt && (
          <InviteExpiry
            className="mt-4 border-t border-rose/15 pt-4"
            expiresAt={expiresAt}
            onRenewed={(next) => {
              setInviteCode(next.inviteCode)
              setExpiresAt(next.inviteExpiresAt)
              setInviteLink(`${window.location.origin}/invite/${next.inviteCode}`)
              setCopied(false)
            }}
          />
        )}
      </div>

      {error && <p className="mb-4 text-center text-xs text-danger">{error}</p>}

      <div className="space-y-3">
        <button
          onClick={copyCode}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3.5 text-sm font-semibold text-ink transition-colors hover:border-rose hover:text-rose"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-sage-dark" />
              Link copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy invite link
            </>
          )}
        </button>

        <button
          onClick={shareWhatsApp}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" />
          Send on WhatsApp
        </button>
      </div>

      <p className="mt-5 text-center text-xs text-ink-muted">
        Did your partner make a code first?{' '}
        <Link href="/onboarding/couple?join=1" className="font-semibold text-rose hover:text-rose-dark">
          Enter their code
        </Link>
      </p>

      <div className="mt-8">
        <Button onClick={() => router.push('/onboarding/install')} variant="secondary" size="lg">
          Continue without waiting
        </Button>
      </div>
    </div>
  )
}
