'use client'

import { useRef, useState } from 'react'
import { Hourglass, Quote, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import StatementCard from './StatementCard'
import { cancelRound, TwoTruthsError } from './api'
import { cap, errorCode, errorText, sentWhen, type ErrorCode, type Round } from './logic'

interface WaitingViewProps {
  /** My own round nobody has guessed yet. */
  round: Round
  partnerName: string
  /** The couple space is closed: nobody will guess it anymore. */
  closed: boolean
  onCanceled: () => void
  onStale: (code: ErrorCode) => void
}

export default function WaitingView({ round, partnerName, closed, onCanceled, onStale }: WaitingViewProps) {
  const [confirming, setConfirming] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const them = cap(partnerName)

  async function cancel() {
    if (busy.current) return
    busy.current = true
    setCanceling(true)
    setError(null)
    try {
      await cancelRound(round.id)
      setConfirming(false)
      onCanceled()
    } catch (e) {
      const code = e instanceof TwoTruthsError ? e.code : errorCode({ message: e instanceof Error ? e.message : null })
      setError(code === 'TT_ALREADY_GUESSED' ? `Too late, ${partnerName} just guessed it.` : errorText(code, partnerName))
      if (code === 'TT_ALREADY_GUESSED' || code === 'TT_NOT_FOUND') {
        setConfirming(false)
        onStale(code)
      }
    } finally {
      setCanceling(false)
      busy.current = false
    }
  }

  return (
    <div className="px-6 pt-5">
      <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600" aria-hidden="true">
          <Hourglass className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{closed ? 'Nobody will guess this one' : `Waiting for ${partnerName}`}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {closed
              ? `${them} left before guessing. You can cancel it to clear it away.`
              : `Sent ${sentWhen(round.createdAt)}. You'll get a notification when ${partnerName} guesses.`}
          </p>
        </div>
      </div>

      <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-ink-muted">Your round</p>
      <div className="space-y-3">
        {round.statements.map((text, i) => (
          <StatementCard key={i} index={i} text={text} verdict={i === round.lieIndex ? 'lie' : 'truth'} />
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-white p-4 shadow-card">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          <Quote className="h-3.5 w-3.5" aria-hidden="true" /> Your story
        </p>
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">
          {round.story ?? <span className="text-ink-muted">No story added.</span>}
        </p>
        {round.story && !closed && <p className="mt-2 text-xs text-ink-muted">{them} sees this after guessing.</p>}
      </div>

      {error && !confirming && (
        <p role="alert" className="mt-4 rounded-xl border border-rose/20 bg-rose/5 px-4 py-3 text-xs font-medium text-rose">
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button variant="secondary" onClick={() => { setError(null); setConfirming(true) }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Cancel round
        </Button>
      </div>

      <Modal open={confirming} onClose={() => { if (!canceling) setConfirming(false) }} title="Cancel this round?">
        <p className="text-sm leading-relaxed text-ink-light">
          {closed
            ? 'It disappears from your history.'
            : `${them} won't be able to guess it, and it won't count in your score. You can write a new one right after.`}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose/20 bg-rose/5 px-4 py-3 text-xs font-medium text-rose">
            {error}
          </p>
        )}
        <div className="mt-5 space-y-2">
          <Button variant="danger" onClick={cancel} loading={canceling}>
            Cancel round
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={canceling}>
            Keep it
          </Button>
        </div>
      </Modal>
    </div>
  )
}
