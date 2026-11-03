'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { TypedConfirmModal } from './TypedConfirmModal'
import { exportOutcomeMessage, useDataExport } from './useDataExport'

interface DiscardCoupleModalProps {
  open: boolean
  onClose: () => void
  /** Retry the join with discard: true. */
  onConfirm: () => void
  loading: boolean
  error: string
  /** My current couple is a closed archive (my partner left), not a fresh solo space. */
  closed?: boolean
}

/**
 * Shown when joining a partner's code would delete the space I'm in now
 * (join_couple said COUPLE_HAS_DATA). Joining only goes ahead after typing DELETE.
 */
export function DiscardCoupleModal({ open, onClose, onConfirm, loading, error, closed }: DiscardCoupleModalProps) {
  const { exporting, ready, exportData, shareReady } = useDataExport()
  const [exportNote, setExportNote] = useState('')

  async function run(step: () => Promise<Parameters<typeof exportOutcomeMessage>[0]>) {
    setExportNote('')
    try {
      setExportNote(exportOutcomeMessage(await step()) ?? '')
    } catch (e: unknown) {
      setExportNote(`Couldn't export your data: ${e instanceof Error && e.message ? e.message : 'try again'}`)
    }
  }

  return (
    <TypedConfirmModal
      open={open}
      onClose={onClose}
      title="Delete your current space?"
      phrase="DELETE"
      confirmLabel="Delete and join"
      loading={loading}
      error={error}
      onConfirm={onConfirm}
    >
      <p>
        {closed
          ? 'You still keep a memory archive with your previous partner.'
          : 'Your current couple space already has memories in it.'}{' '}
        To join with this code,
        <span className="font-semibold text-danger"> that space and everything in it is deleted for good</span>:
        moments with their photos, letters, savings, the calendar, the bucket list, Jar, moods, all of it.
      </p>
      <p>This can&apos;t be undone. Your own account stays.</p>
      <div className="rounded-xl bg-cream px-3 py-2.5">
        <p className="text-xs">Want to save a copy first?</p>
        <button
          type="button"
          onClick={() => run(ready ? shareReady : exportData)}
          disabled={exporting || loading}
          className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose hover:text-rose-dark disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Preparing your data...' : ready ? 'Save file' : 'Export my data'}
        </button>
        {exportNote && <p className="mt-1.5 text-[11px] leading-relaxed">{exportNote}</p>}
      </div>
    </TypedConfirmModal>
  )
}
