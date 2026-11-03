'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import StatementCard from './StatementCard'
import { guessRound, TwoTruthsError } from './api'
import { cap, errorCode, errorText, roundDate, type ErrorCode, type GuessResult, type Round } from './logic'

interface GuessViewProps {
  round: Round
  partnerName: string
  onGuessed: (result: GuessResult) => void
  /** The round changed under us (already guessed, canceled): reload the list. */
  onStale: (code: ErrorCode) => void
}

// The server answers in a few hundred ms; a short beat makes the moment land.
const SUSPENSE_MS = 900
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function GuessView({ round, partnerName, onGuessed, onStale }: GuessViewProps) {
  const [pick, setPick] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const them = cap(partnerName)

  async function submit() {
    if (pick === null || busy.current) return
    busy.current = true
    setThinking(true)
    setError(null)
    try {
      const [result] = await Promise.all([guessRound(round.id, pick), wait(SUSPENSE_MS)])
      onGuessed(result)
    } catch (e) {
      const code = e instanceof TwoTruthsError ? e.code : errorCode({ message: e instanceof Error ? e.message : null })
      setError(errorText(code, partnerName, e instanceof Error ? e.message : null))
      setThinking(false)
      busy.current = false
      if (code === 'TT_ALREADY_GUESSED' || code === 'TT_NOT_FOUND' || code === 'TT_CLOSED') onStale(code)
    }
  }

  // Arrow keys move the choice, like a native radio group.
  function onKeyDown(e: React.KeyboardEvent) {
    if (thinking) return
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = ((pick ?? (step > 0 ? -1 : 0)) + step + 3) % 3
    setPick(next)
    cards.current[next]?.focus()
  }

  return (
    <div className="px-6 pt-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600">
        {them} · {roundDate(round.createdAt)}
      </p>
      <h2 className="mt-1 text-xl font-black leading-tight text-ink">Which one is the lie?</h2>
      <p className="mt-1 text-sm text-ink-muted">Two of these are true. You get one guess.</p>

      <div role="radiogroup" aria-label="Pick the lie" className="mt-4 space-y-3" onKeyDown={onKeyDown}>
        {round.statements.map((text, i) => (
          <StatementCard
            key={i}
            index={i}
            text={text}
            selected={pick === i}
            disabled={thinking}
            thinking={thinking}
            onSelect={() => { setPick(i); setError(null) }}
            buttonRef={(el) => { cards.current[i] = el }}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose/20 bg-rose/5 px-4 py-3 text-xs font-medium text-rose">
          {error}
        </p>
      )}

      <div className="mt-5">
        <Button onClick={submit} disabled={pick === null} loading={thinking}>
          {thinking ? 'Checking…' : 'Lock in guess'}
        </Button>
        <p className="mt-2 text-center text-xs text-ink-muted">
          {pick === null ? 'Tap the one you think is made up.' : `Number ${pick + 1} it is? No changing your mind after this.`}
        </p>
      </div>
    </div>
  )
}
