'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface TypedConfirmModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** What happens, shown above the input. */
  children: React.ReactNode
  /** The exact text the user must type, e.g. "LEAVE". */
  phrase: string
  confirmLabel: string
  loading: boolean
  error: string
  onConfirm: () => void
}

/** A destructive action that only unlocks once the user types `phrase`. */
export function TypedConfirmModal({
  open, onClose, title, children, phrase, confirmLabel, loading, error, onConfirm,
}: TypedConfirmModalProps) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (open) setTyped('') }, [open])
  const matches = typed.trim().toUpperCase() === phrase

  return (
    <Modal open={open} onClose={() => { if (!loading) onClose() }} title={title}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (matches && !loading) onConfirm() }}
        className="space-y-4"
      >
        <div className="max-h-[40vh] space-y-2 overflow-y-auto text-sm leading-relaxed text-ink-muted">{children}</div>
        <div className="space-y-1">
          <label htmlFor="typed-confirm" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Type <span className="font-mono text-danger">{phrase}</span> to continue
          </label>
          <input
            id="typed-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={phrase}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 font-mono text-sm tracking-wider text-ink placeholder:text-ink-muted/40 focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/20"
          />
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="danger" loading={loading} disabled={!matches}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
