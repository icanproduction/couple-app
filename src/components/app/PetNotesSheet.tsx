'use client'

// The last 30 daily notes, newest first. Monday notes carry a title.
import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { fetchNotes, isOffline, type ShownNote } from '@/components/pet/api'

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function noteDate(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(t) ? date : DAY.format(t)
}

interface Props {
  open: boolean
  onClose: () => void
  petId: string
  petName: string
  /** Bumped when a new note arrives in realtime, so an open sheet refreshes. */
  version?: number
}

export default function PetNotesSheet({ open, onClose, petId, petName, version = 0 }: Props) {
  const [notes, setNotes] = useState<ShownNote[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setNotes(await fetchNotes(petId))
    } catch {
      setError(isOffline() ? "You're offline. The notes load once you're back." : "Couldn't load the notes. Try again.")
    }
  }, [petId])

  useEffect(() => {
    if (open) void load()
  }, [open, load, version])

  return (
    <Modal open={open} onClose={onClose} title={`Notes from ${petName}`}>
      {error ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-ink-light">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      ) : notes === null ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-sm leading-relaxed text-ink-muted">
          {petName} writes a short note every morning. The first one shows up here.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((n) => (
            <li key={n.date} className="rounded-2xl border border-border bg-white p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{noteDate(n.date)}</span>
                {n.kind === 'weekly' && (
                  <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-yellow-700">Weekly</span>
                )}
              </div>
              {n.title && <p className="text-sm font-bold text-ink">{n.title}</p>}
              <p className="break-words text-sm leading-relaxed text-ink-light">{n.line}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
