'use client'

import { useEffect, useRef, useState } from 'react'
import { EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { TOD_HEATS, TOD_HEAT_INFO, TOD_KINDS, type TodHeat, type TodKind } from './deck'
import {
  CUSTOM_BODY_MAX, CUSTOM_CARDS_MAX, addCustomCard, customBodyError, deleteCustomCard,
  type CustomCardRow,
} from './cards-api'

const KIND_LABEL: Record<TodKind, string> = { truth: 'Truth', dare: 'Dare' }
const PLACEHOLDER: Record<TodKind, string> = {
  truth: 'Ask something only the two of you would get',
  dare: 'Dare them to do something you can both laugh about',
}

interface Props {
  open: boolean
  onClose: () => void
  coupleId: string
  userId: string
  partnerName: string
  rows: CustomCardRow[]
  state: 'loading' | 'ready' | 'error'
  onRetry: () => void
  onAdded: (row: CustomCardRow) => void
  onDeleted: (id: string) => void
}

export function CustomCardsSheet({ open, onClose, coupleId, userId, partnerName, rows, state, onRetry, onAdded, onDeleted }: Props) {
  const [kind, setKind] = useState<TodKind>('truth')
  const [heat, setHeat] = useState<TodHeat>('sweet')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [justAdded, setJustAdded] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const savingRef = useRef(false)

  useEffect(() => {
    if (!justAdded) return
    const t = setTimeout(() => setJustAdded(false), 2500)
    return () => clearTimeout(t)
  }, [justAdded])

  useEffect(() => {
    if (open) return
    setConfirmId(null)
    setFormError('')
    setDeleteError('')
  }, [open])

  const mine = rows.filter((r) => r.created_by === userId)
  const theirs = rows.length - mine.length
  const full = rows.length >= CUSTOM_CARDS_MAX
  const trimmedLength = body.trim().length

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (savingRef.current || full) return
    const problem = customBodyError(body)
    if (problem) { setFormError(problem); return }
    savingRef.current = true
    setSaving(true)
    setFormError('')
    try {
      const row = await addCustomCard({ coupleId, userId, kind, heat, body })
      onAdded(row)
      setBody('')
      setJustAdded(true)
    } catch (err) {
      // The cap can be reached from the other phone while this list is stale.
      const capped = err instanceof Error && /custom cards/.test(err.message)
      setFormError(capped
        ? `You have ${CUSTOM_CARDS_MAX} cards, the most a couple can keep. Delete a few to add more.`
        : "Couldn't save the card. Check your connection and try again.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (deletingId) return
    setDeletingId(id)
    setDeleteError('')
    try {
      await deleteCustomCard(id)
      onDeleted(id)
      setConfirmId(null)
    } catch {
      setDeleteError("Couldn't delete the card. Try again.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your own cards">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Card type">
          {TOD_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'min-h-[44px] rounded-xl border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
                kind === k ? 'border-rose bg-rose-50 text-rose-dark' : 'border-border bg-white text-ink-muted',
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Heat">
          {TOD_HEATS.map((h) => {
            const info = TOD_HEAT_INFO[h]
            const selected = heat === h
            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setHeat(h)}
                className={cn(
                  'min-h-[40px] rounded-xl border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
                  selected ? 'border-transparent text-white' : 'border-border bg-white text-ink-muted',
                )}
                style={selected ? { backgroundColor: info.color } : undefined}
              >
                {info.name}
              </button>
            )
          })}
        </div>

        <div>
          <label htmlFor="tod-custom-body" className="sr-only">Card text</label>
          <textarea
            id="tod-custom-body"
            value={body}
            onChange={(e) => { setBody(e.target.value); if (formError) setFormError('') }}
            maxLength={CUSTOM_BODY_MAX}
            rows={3}
            placeholder={PLACEHOLDER[kind]}
            disabled={full}
            className="w-full resize-none rounded-2xl border border-border bg-cream/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20 disabled:opacity-60"
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
            <span className={cn('text-ink-muted', { 'font-medium text-danger': !!formError })} role={formError ? 'alert' : undefined}>
              {formError || (full ? `You have ${CUSTOM_CARDS_MAX} cards, the most a couple can keep. Delete a few to add more.` : 'Keep it kind. Both of you will see it during a game.')}
            </span>
            <span className="flex-shrink-0 tabular-nums text-ink-muted">{trimmedLength}/{CUSTOM_BODY_MAX}</span>
          </div>
        </div>

        <Button type="submit" loading={saving} disabled={full || trimmedLength === 0}>
          {!saving && <Plus className="h-4 w-4" />}
          {justAdded ? 'Added. Write another?' : 'Add card'}
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Yours</p>

        {state === 'loading' ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : state === 'error' ? (
          <div className="mt-3 rounded-2xl border border-border p-4 text-center">
            <p className="text-sm text-ink-muted">Couldn&apos;t load your cards.</p>
            <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 px-3 text-sm font-semibold text-rose">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : mine.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-ink-muted">
            No cards yet. Inside jokes and old stories make the best ones.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((row) => {
              const info = TOD_HEAT_INFO[row.heat]
              const confirming = confirmId === row.id
              return (
                <li key={row.id} className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: info.color }}>
                          {KIND_LABEL[row.kind]}
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: info.soft, color: info.color }}>
                          {info.name}
                        </span>
                      </div>
                      <p className="mt-1.5 break-words text-sm text-ink">{row.body}</p>
                    </div>
                    {!confirming && (
                      <button
                        type="button"
                        onClick={() => { setConfirmId(row.id); setDeleteError('') }}
                        aria-label="Delete card"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {confirming && (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <span className="mr-auto text-xs text-ink-muted">Delete this card?</span>
                      <button type="button" onClick={() => setConfirmId(null)} className="min-h-[36px] rounded-lg px-3 text-xs font-semibold text-ink-muted">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        disabled={deletingId === row.id}
                        className="min-h-[36px] rounded-lg bg-danger px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {deletingId === row.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {deleteError && <p role="alert" className="mt-2 text-xs font-medium text-danger">{deleteError}</p>}

        {state === 'ready' && theirs > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-cream p-3">
            <EyeOff className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
            <p className="text-xs text-ink-light">
              {partnerName} wrote {theirs === 1 ? 'a card' : `${theirs} cards`} for you. {theirs === 1 ? 'It stays' : 'They stay'} hidden until {theirs === 1 ? 'it comes' : 'they come'} up in a game.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
