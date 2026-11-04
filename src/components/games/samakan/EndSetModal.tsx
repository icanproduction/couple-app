'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { codeFor, endSet, messageFor } from '@/lib/samakan'

interface EndSetModalProps {
  setId: string | null
  onClose: () => void
  /** Ended (or it had already ended on the other phone). */
  onEnded: () => void
}

/** "End this set for both of you?" Either partner can end an open set. */
export default function EndSetModal({ setId, onClose, onEnded }: EndSetModalProps) {
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  async function confirm() {
    if (!setId || busy.current) return
    busy.current = true
    setEnding(true)
    setError(null)
    try {
      await endSet(setId)
      onEnded()
    } catch (e) {
      if (codeFor(e) === 'SK_ENDED') onEnded()
      else setError(messageFor(e))
    } finally {
      busy.current = false
      setEnding(false)
    }
  }

  return (
    <Modal open={setId !== null} onClose={() => { if (!ending) { setError(null); onClose() } }} title="End this set?">
      <p className="text-sm leading-relaxed text-ink-light">
        End this set for both of you? Rounds you both answered stay in your history.
      </p>
      {error && <p role="alert" className="mt-3 text-xs font-medium text-rose-dark">{error}</p>}
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" onClick={onClose} disabled={ending}>Keep playing</Button>
        <Button variant="danger" onClick={confirm} loading={ending}>End set</Button>
      </div>
    </Modal>
  )
}
