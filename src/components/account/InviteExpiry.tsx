'use client'

import { useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatInviteExpiry, isInviteExpired, regenerateInviteCode, type MyCouple } from '@/lib/couple'

interface InviteExpiryProps {
  expiresAt: string
  onRenewed: (next: Pick<MyCouple, 'inviteCode' | 'inviteExpiresAt'>) => void
  className?: string
}

/** "Valid until …" / "Expired" under an invite code, with "New code". */
export function InviteExpiry({ expiresAt, onRenewed, className }: InviteExpiryProps) {
  const [renewing, setRenewing] = useState(false)
  const [error, setError] = useState('')
  const expired = isInviteExpired(expiresAt)

  async function renew() {
    if (renewing) return
    setRenewing(true)
    setError('')
    try {
      const next = await regenerateInviteCode()
      onRenewed({ inviteCode: next.inviteCode, inviteExpiresAt: next.inviteExpiresAt })
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't make a new code. Try again.")
    }
    setRenewing(false)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <p className={cn('flex items-center gap-1.5 text-xs', expired ? 'font-semibold text-danger' : 'text-ink-muted')}>
          <Clock className="h-3.5 w-3.5" />
          {expired ? 'This code has expired' : `Valid until ${formatInviteExpiry(expiresAt)}`}
        </p>
        <button
          type="button"
          onClick={renew}
          disabled={renewing}
          className={cn(
            'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60',
            expired ? 'bg-rose text-white hover:bg-rose-dark' : 'text-rose hover:bg-rose-50'
          )}
        >
          <RefreshCw className={cn('h-3 w-3', renewing && 'animate-spin')} />
          {renewing ? 'Making...' : 'New code'}
        </button>
      </div>
      {expired && !error && (
        <p className="text-center text-[11px] leading-relaxed text-ink-muted">
          Invite codes last 7 days. Make a new one and send it to your partner again.
        </p>
      )}
      {error && <p role="alert" className="text-center text-xs text-danger">{error}</p>}
    </div>
  )
}
