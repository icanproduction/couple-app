'use client'

import { useCallback, useState } from 'react'

/**
 * - shared: handed to the share sheet (iOS home-screen apps can't download)
 * - downloaded: saved through a regular file download
 * - cancelled: the user closed the share sheet; nothing was saved
 * - needs-tap: the file is ready but the browser wants a fresh tap to share it
 *   (call `shareReady` from a button)
 */
export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap'

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
  } catch {
    return false
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Share the file; falls back to a download only when sharing isn't possible at all. */
async function shareOrDownload(file: File): Promise<ExportOutcome> {
  if (!canShareFile(file)) {
    download(file)
    return 'downloaded'
  }
  try {
    await navigator.share({ files: [file], title: 'Nanti Kita data' })
    return 'shared'
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'AbortError') return 'cancelled'
    // Safari drops the tap's "user activation" while the export downloads;
    // sharing then needs a second tap on a button of its own.
    if (name === 'NotAllowedError') return 'needs-tap'
    download(file)
    return 'downloaded'
  }
}

/** "Export my data": fetches /api/account/export and saves it the way this device can. */
export function useDataExport() {
  const [exporting, setExporting] = useState(false)
  const [ready, setReady] = useState<File | null>(null)

  const exportData = useCallback(async (): Promise<ExportOutcome> => {
    setExporting(true)
    setReady(null)
    try {
      const res = await fetch('/api/account/export', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : "Couldn't export your data")
      }
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'nanti-kita.json'
      const file = new File([await res.blob()], name, { type: 'application/json' })
      const outcome = await shareOrDownload(file)
      if (outcome === 'needs-tap') setReady(file)
      return outcome
    } finally {
      setExporting(false)
    }
  }, [])

  /** Second step after 'needs-tap'; must run straight from a click. */
  const shareReady = useCallback(async (): Promise<ExportOutcome> => {
    if (!ready) return 'cancelled'
    const outcome = await shareOrDownload(ready)
    if (outcome !== 'needs-tap') setReady(null)
    return outcome
  }, [ready])

  return { exporting, ready: ready !== null, exportData, shareReady }
}

/** The message to show for an outcome, or null when there is nothing to say. */
export function exportOutcomeMessage(outcome: ExportOutcome): string | null {
  switch (outcome) {
    case 'shared': return 'Your data went to the share menu. Make sure the file ends up somewhere safe.'
    case 'downloaded': return 'Your data is downloaded. Keep the file somewhere safe.'
    case 'needs-tap': return 'Your data is ready. Tap "Save file" to keep it.'
    case 'cancelled': return null
  }
}
