import { Clock } from 'lucide-react'

/** Shown by the join forms when join_couple says the code has expired. */
export function ExpiredInviteNotice() {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3">
      <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" />
      <div>
        <p className="text-sm font-semibold text-ink">This invite code has expired</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          Codes last 7 days. Ask your partner to open Profile and tap &ldquo;New code&rdquo;,
          then enter the new code here.
        </p>
      </div>
    </div>
  )
}
