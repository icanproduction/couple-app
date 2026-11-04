// "Add from photos" on the Moments page opens the photo picker there and
// hands the picked files to this page across a client-side navigation.
// A File can't travel in the URL, so it waits here in memory: a reload or a
// late arrival simply starts an empty form. Not a route (no page.tsx export).

const MAX_AGE_MS = 2 * 60_000

let pending: { files: File[]; at: number } | null = null

/** Called right before router.push('/app/moments/baru?from=photos'). */
export function handOffPhotos(files: File[]): void {
  pending = files.length > 0 ? { files, at: Date.now() } : null
}

/** Reads without clearing, so a double render in development sees the same files. */
export function peekHandedOffPhotos(): File[] {
  if (!pending || Date.now() - pending.at > MAX_AGE_MS) return []
  return pending.files
}

export function clearHandedOffPhotos(): void {
  pending = null
}
