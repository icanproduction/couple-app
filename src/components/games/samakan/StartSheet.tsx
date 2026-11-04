'use client'

// "Start "Weekends"?" with one confirm, so a stray tap never pushes the
// partner. "For you two" shows a short writing state while Claude drafts the
// rounds; the server falls back to a bank set after 12 s.

import { useRef, useState } from 'react'
import { Loader2, Radio } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { codeFor, createSet, messageFor, type CreateSetResult } from '@/lib/samakan'
import { THEME_LABELS } from './logic'
import { cap } from './ui'
import type { SamakanTheme } from '@/types/samakan'

export type StartTheme = Exclude<SamakanTheme, 'mixed'>

interface StartSheetProps {
  theme: StartTheme | null
  partner: string
  onClose: () => void
  onStarted: (result: CreateSetResult) => void
}

export default function StartSheet({ theme, partner, onClose, onStarted }: StartSheetProps) {
  const [starting, setStarting] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const label = theme ? THEME_LABELS[theme] : ''
  const personal = theme === 'personal'

  async function start(playNow: boolean) {
    if (!theme || busy.current) return
    busy.current = true
    setStarting(true)
    setLive(playNow)
    setError(null)
    try {
      const result = await createSet(theme, { playNow })
      onStarted(result)
    } catch (e) {
      setError(codeFor(e) === 'NETWORK'
        ? 'Couldn\'t start the set. Check your connection and try again.'
        : messageFor(e))
      setStarting(false)
    } finally {
      busy.current = false
    }
  }

  function close() {
    if (starting) return
    setError(null)
    onClose()
  }

  return (
    <Modal open={theme !== null} onClose={close} title={starting && personal ? undefined : `Start "${label}"?`}>
      {starting && personal ? (
        <div className="py-6 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-purple-500" aria-hidden="true" />
          <p className="mt-4 text-base font-bold text-ink">Writing seven rounds for you two...</p>
          <p className="mt-1 text-sm text-ink-muted">Using your Daily Questions, Moments and moods.</p>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-light">
            7 rounds, about 3 minutes. {cap(partner)} gets a notification and can answer whenever.
          </p>
          {personal && (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Claude writes this set from your Daily Question answers, Moment titles and moods. One a day.
            </p>
          )}
          {error && <p role="alert" className="mt-3 break-words text-xs font-medium text-rose-dark">{error}</p>}
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" onClick={close} disabled={starting}>Cancel</Button>
            <Button onClick={() => void start(false)} loading={starting && !live} disabled={starting}>Start</Button>
          </div>
          <button
            type="button"
            onClick={() => void start(true)}
            disabled={starting}
            className="mt-4 flex w-full items-center justify-center gap-1.5 py-1 text-sm font-semibold text-purple-700 hover:text-purple-900 disabled:opacity-60"
          >
            {starting && live
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Radio className="h-4 w-4" aria-hidden="true" />}
            Together right now? Start and invite {cap(partner)}
          </button>
        </>
      )}
    </Modal>
  )
}
