'use client'

// Bucket list pieces for the optional link and picture: the link chip, a
// picture behind a signed URL, the full-screen viewer and the form field.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, ImageOff, ImagePlus, Link2, Loader2, MapPin, RefreshCw, Trash2, X } from 'lucide-react'
import { isMapLink, linkLabel } from '@/lib/bucket'
import { cn } from '@/lib/utils'
import { resignPicture } from './pictures'

/** Compact chip for an item's reference link; opens in a new tab. */
export function LinkChip({ url, className }: { url: string; className?: string }) {
  // The DB only stores http(s), this is a second fence for the href.
  if (!/^https?:\/\//i.test(url)) return null
  const label = linkLabel(url)
  const Icon = isMapLink(url) ? MapPin : Link2
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={`Open ${label} in a new tab`}
      className={cn(
        'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-rose/20 bg-rose-50 px-3 text-xs font-semibold text-rose active:scale-[0.98]',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
    </a>
  )
}

/**
 * A picture behind a short-lived signed URL. `url` undefined means it is
 * still being signed (shimmer), null means signing failed. When a URL has
 * expired by the time it loads, it asks for a fresh one once.
 */
export function SignedImg({
  path, url, alt, fit = 'cover', className, showRetry = false, lazy = false,
}: {
  path: string
  url: string | null | undefined
  alt: string
  fit?: 'cover' | 'contain'
  className?: string
  /** Show a "Try again" button when the picture can't load (the viewer) */
  showRetry?: boolean
  /** Load only near the viewport (list thumbnails); an expired URL is re-signed on error */
  lazy?: boolean
}) {
  // A replacement belongs to the url it replaced; a new url from the parent wins.
  const [fresh, setFresh] = useState<{ from: string | null | undefined; url: string } | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const retriedFor = useRef<string | null>(null)
  const shown = fresh && fresh.from === url ? fresh.url : url

  function resign(from: string | null | undefined) {
    setRetrying(true)
    resignPicture(path)
      .then((u) => {
        if (u) setFresh({ from, url: u })
        else setFailedSrc(shown ?? 'none')
      })
      .catch(() => setFailedSrc(shown ?? 'none'))
      .finally(() => setRetrying(false))
  }

  function handleError() {
    if (!shown) return
    if (retriedFor.current === shown) { setFailedSrc(shown); return }
    retriedFor.current = shown
    resign(url)
  }

  const failed = !retrying && ((url === null && !fresh) || (!!shown && failedSrc === shown))
  const loading = !failed && (!shown || loadedSrc !== shown || retrying)

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {shown && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
        <img
          src={shown}
          alt={alt}
          decoding="async"
          loading={lazy ? 'lazy' : undefined}
          onLoad={() => setLoadedSrc(shown)}
          onError={handleError}
          className={cn(
            'h-full w-full transition-opacity duration-200',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            loading ? 'opacity-0' : 'opacity-100'
          )}
        />
      )}
      {loading && <div className="absolute inset-0 animate-pulse bg-ink/10" aria-hidden />}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream text-ink-muted">
          <ImageOff className="h-5 w-5" aria-hidden />
          {showRetry ? (
            <>
              <p className="px-4 text-center text-xs">Couldn&apos;t load the picture.</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFailedSrc(null); retriedFor.current = null; resign(url) }}
                className="flex min-h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-rose"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </>
          ) : (
            <span className="sr-only">Picture unavailable</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Full-screen view of one item's picture. Tap anywhere, Esc or X closes it. */
export function PictureViewer({
  path, url, title, link, onClose,
}: {
  path: string
  url: string | null | undefined
  title: string
  link: string | null
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [onClose])

  // Portal to <body>: the page animates in with a transform, which would trap
  // a fixed overlay under the bottom nav.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Picture for ${title}`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 px-3">
        <SignedImg path={path} url={url} alt={title} fit="contain" showRetry className="h-full w-full rounded-lg" />
      </div>
      <div
        className="flex min-h-[4.5rem] items-center justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        {link && <LinkChip url={link} className="border-white/20 bg-white/10 text-white" />}
      </div>
    </div>,
    document.body
  )
}

export type FormPicture =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'set'; blob: Blob; preview: string }

/** "Picture (optional)" in the add/edit form: pick, preview, replace, remove. */
export function PictureField({
  picture, existingPath, existingUrl, preparing, error, disabled, onPick, onRemove, onUndoRemove,
}: {
  picture: FormPicture
  /** The edited item's current picture, if it has one */
  existingPath: string | null
  existingUrl: string | null | undefined
  preparing: boolean
  error: string
  disabled: boolean
  onPick: (file: File) => void
  onRemove: () => void
  onUndoRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const showingExisting = picture.kind === 'keep' && !!existingPath
  const hasPicture = picture.kind === 'set' || showingExisting
  const pick = () => input.current?.click()

  return (
    <div>
      <p id="bucket-picture-label" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Picture (optional)
      </p>

      {hasPicture ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-cream">
          <div className="relative h-44 w-full">
            {picture.kind === 'set' ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file
              <img src={picture.preview} alt="Picture preview" className="h-full w-full object-contain" />
            ) : (
              <SignedImg path={existingPath as string} url={existingUrl} alt="Current picture" fit="contain" className="h-full w-full" />
            )}
            {preparing && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-5 w-5 animate-spin text-rose" aria-hidden />
                <span className="sr-only">Preparing the picture</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 border-t border-border bg-white">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || preparing}
              className="flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-rose disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" /> Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || preparing}
              className="flex min-h-11 items-center justify-center gap-1.5 border-l border-border text-xs font-semibold text-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || preparing}
          aria-describedby="bucket-picture-label"
          className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-4 text-sm font-semibold text-rose disabled:opacity-60"
        >
          {preparing ? (
            <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing the picture</>
          ) : (
            <><ImagePlus className="h-4 w-4" aria-hidden /> Add a picture</>
          )}
        </button>
      )}

      {picture.kind === 'remove' && existingPath && (
        <p className="mt-1.5 text-xs text-ink-muted">
          The picture goes when you save.{' '}
          <button type="button" onClick={onUndoRemove} disabled={disabled} className="font-semibold text-rose">
            Undo
          </button>
        </p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">{error}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </div>
  )
}
