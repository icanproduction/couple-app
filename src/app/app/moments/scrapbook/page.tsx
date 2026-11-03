'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookHeart, Check, Loader2, Printer } from 'lucide-react'
import ScrapbookPages from '@/components/moments/scrapbook/ScrapbookPages'
import { SCRAPBOOK_PRINT_CSS } from '@/components/moments/scrapbook/styles'
import { formatDateID, monthKeyJakarta } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SIGNED_URL_MIN_LIFE_MS, getCoupleInfo, monthLabel, signPhotoPaths, type SignedUrl } from '@/lib/moments'
import {
  MAX_COVER_TITLE, SCRAPBOOK_STYLES,
  filterByRange, listScrapbookMoments, rangeLabel, waitForImages,
  type RangeKind, type ScrapbookMoment, type ScrapbookStyle,
} from '@/lib/scrapbook'

const RANGE_OPTIONS: { id: RangeKind; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'month', label: 'Pick a month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
  { id: 'manual', label: 'Pick moments' },
]

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
    active ? 'bg-rose text-white shadow-card' : 'border border-border bg-white text-ink-light'
  )

const fieldClass =
  'w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10'

/** Signed and not about to expire. */
const isFresh = (s: SignedUrl | undefined, now: number) => !!s && s.expiresAt - now > SIGNED_URL_MIN_LIFE_MS

export default function ScrapbookPage() {
  const router = useRouter()
  const [moments, setMoments] = useState<ScrapbookMoment[]>([])
  const [names, setNames] = useState('')
  const [hasCouple, setHasCouple] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [kind, setKind] = useState<RangeKind>('this-month')
  const [month, setMonth] = useState(() => monthKeyJakarta())
  const [year, setYear] = useState(() => Number(monthKeyJakarta().slice(0, 4)))
  const [manualIds, setManualIds] = useState<Set<string>>(new Set())
  const [style, setStyle] = useState<ScrapbookStyle>('polaroid')
  const [title, setTitle] = useState('')

  const [urls, setUrls] = useState<Record<string, SignedUrl>>({})
  const urlsRef = useRef(urls)
  urlsRef.current = urls
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')
  const [signTick, setSignTick] = useState(0)
  const [photosReady, setPhotosReady] = useState(false)
  const [missingPhotos, setMissingPhotos] = useState(0)
  const [printNote, setPrintNote] = useState('')
  const pagesRef = useRef<HTMLDivElement>(null)
  const signRequest = useRef(0)
  const readyRequest = useRef(0)
  const retriedPaths = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const info = await getCoupleInfo()
        if (!info) { router.replace('/auth/login'); return }
        if (!info.coupleId) { if (!cancelled) setHasCouple(false); return }
        const list = await listScrapbookMoments(info.coupleId)
        if (cancelled) return
        const me = info.names[info.userId]
        const partner = info.partnerId ? info.names[info.partnerId] : undefined
        setNames([me, partner].filter(Boolean).join(' & '))
        setMoments(list)
        const thisMonth = monthKeyJakarta()
        if (!list.some((m) => m.moment_date.startsWith(`${thisMonth}-`)) && list.length > 0) {
          // Nothing this month yet: start from the latest month that has moments.
          const latest = list[list.length - 1].moment_date
          setKind('month')
          setMonth(latest.slice(0, 7))
          setYear(Number(latest.slice(0, 4)))
        }
      } catch {
        if (!cancelled) setError("Couldn't load your moments. Try opening this page again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const years = useMemo(
    () => Array.from(new Set(moments.map((m) => Number(m.moment_date.slice(0, 4))))).sort((a, b) => b - a),
    [moments]
  )
  // Only months that actually have moments, newest first, with a count.
  const months = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of moments) counts.set(m.moment_date.slice(0, 7), (counts.get(m.moment_date.slice(0, 7)) ?? 0) + 1)
    return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => b.key.localeCompare(a.key))
  }, [moments])

  function chooseKind(next: RangeKind) {
    setKind(next)
    if (next === 'month' && months.length > 0 && !months.some((m) => m.key === month)) setMonth(months[0].key)
    if (next === 'year' && years.length > 0 && !years.includes(year)) setYear(years[0])
  }
  const range = useMemo(() => ({ kind, month, year, ids: manualIds }), [kind, month, year, manualIds])
  const selected = useMemo(() => filterByRange(moments, range), [moments, range])
  const label = useMemo(() => rangeLabel(range, selected), [range, selected])
  const coverTitle = title.trim() || 'Our Story'
  const photoCount = selected.reduce((sum, m) => sum + m.photos.length, 0)

  const selectedPaths = useMemo(
    () => Array.from(new Set(selected.flatMap((m) => m.photos.map((p) => p.storage_path)))),
    [selected]
  )
  const urlMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [path, s] of Object.entries(urls)) map[path] = s.url
    return map
  }, [urls])

  // Sign the photos of the moments in this scrapbook (batched, cached), and
  // again for any URL that is missing or close to expiring. Only the newest
  // request drives `signing`, so switching range mid-request can't leave the
  // button stuck on "Loading photos...".
  useEffect(() => {
    const now = Date.now()
    const stale = selectedPaths.filter((p) => !isFresh(urlsRef.current[p], now))
    const id = ++signRequest.current
    if (stale.length === 0) { setSigning(false); return }
    setSigning(true)
    setSignError('')
    signPhotoPaths(stale)
      .then((signed) => {
        // URLs from an older request are still valid: keep them.
        if (Object.keys(signed).length > 0) setUrls((prev) => ({ ...prev, ...signed }))
        if (id === signRequest.current && Object.keys(signed).length < stale.length) setSignError("Some photos didn't load.")
      })
      .catch(() => { if (id === signRequest.current) setSignError("Couldn't load the photos. Try again in a minute.") })
      .finally(() => { if (id === signRequest.current) setSigning(false) })
  }, [selectedPaths, signTick])

  // Re-sign shortly before the oldest URL here gets close to expiring, and
  // when the app comes back into view (timers sleep in the background).
  useEffect(() => {
    const expiries = selectedPaths.flatMap((p) => (urls[p] ? [urls[p].expiresAt] : []))
    if (expiries.length === 0) return
    const wait = Math.min(...expiries) - SIGNED_URL_MIN_LIFE_MS - Date.now()
    const timer = setTimeout(() => setSignTick((t) => t + 1), Math.max(wait, 5_000))
    return () => clearTimeout(timer)
  }, [selectedPaths, urls])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setSignTick((t) => t + 1) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // A photo that fails to load gets one fresh URL (its old one may have expired).
  const handlePhotoError = useCallback((path: string) => {
    if (retriedPaths.current.has(path)) return
    retriedPaths.current.add(path)
    signPhotoPaths([path], { fresh: true })
      .then((signed) => { if (signed[path]) setUrls((prev) => ({ ...prev, ...signed })) })
      .catch(() => undefined)
  }, [])

  // Load every photo (and the fonts) before printing is offered: iOS only
  // opens the print dialog from inside the tap itself, so the tap can't wait.
  useEffect(() => {
    const id = ++readyRequest.current
    setPhotosReady(false)
    const root = pagesRef.current
    if (signing || !root) return
    Promise.all([document.fonts?.ready, waitForImages(root)])
      .then(([, missing]) => {
        if (id !== readyRequest.current) return
        setMissingPhotos(missing)
        setPhotosReady(true)
      })
      .catch(() => { if (id === readyRequest.current) setPhotosReady(true) })
  }, [signing, urlMap, selected, style])

  function toggleManual(id: string) {
    setManualIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canPrint = selected.length > 0 && !signing && photosReady
  const preparing = selected.length > 0 && !canPrint

  // Synchronous on purpose: window.print() must run inside the tap (iOS).
  function handlePrint() {
    if (!canPrint) return
    const now = Date.now()
    if (selectedPaths.some((p) => urls[p] && !isFresh(urls[p], now))) {
      // The device slept past the refresh timer: renew the URLs first.
      setSignTick((t) => t + 1)
      setPrintNote('The photos need a quick refresh. When it finishes, tap Print again.')
      return
    }
    setPrintNote(
      missingPhotos === 0
        ? ''
        : missingPhotos === 1
          ? "1 photo hasn't loaded, but you can still print the scrapbook."
          : `${missingPhotos} photos haven't loaded, but you can still print the scrapbook.`
    )
    window.print()
  }

  return (
    <div className="animate-fade-in pb-8 print:pb-0">
      <style>{SCRAPBOOK_PRINT_CSS}</style>

      <div className="border-b border-border bg-white px-6 pb-5 pt-5 print:hidden">
        <Link href="/app/moments" className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Moments
        </Link>
        <h1 className="text-xl font-bold text-ink">Scrapbook</h1>
        <p className="text-sm text-ink-muted">Your dates in one book, ready to print or save as a PDF</p>
      </div>

      {loading ? (
        <div className="space-y-4 px-6 pt-5 print:hidden">
          <div className="h-40 animate-pulse rounded-2xl bg-rose-50" />
          <div className="aspect-[210/296] animate-pulse rounded-2xl bg-rose-50" />
        </div>
      ) : error ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 print:hidden">{error}</p>
      ) : !hasCouple ? (
        <div className="px-8 pt-16 text-center print:hidden">
          <p className="text-sm text-ink-muted">Connect with your partner first to start saving moments.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : moments.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center print:hidden">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
            <BookHeart className="h-8 w-8 text-rose" />
          </div>
          <h2 className="text-lg font-bold text-ink">Your scrapbook is empty</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Save a few moments from your dates first. Each moment becomes one page.
          </p>
          <Link
            href="/app/moments/baru"
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Save a moment
          </Link>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="space-y-5 px-6 pt-5 print:hidden">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Range</p>
              <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Scrapbook range">
                {RANGE_OPTIONS.map((o) => (
                  <button key={o.id} type="button" onClick={() => chooseKind(o.id)} aria-pressed={kind === o.id} className={chipClass(kind === o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>

              {kind === 'month' && (
                <div className="mt-3">
                  <label htmlFor="sb-month" className="sr-only">Month</label>
                  <select id="sb-month" value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass}>
                    {!months.some((m) => m.key === month) && <option value={month}>{monthLabel(`${month}-01`)} (0)</option>}
                    {months.map((m) => (
                      <option key={m.key} value={m.key}>{monthLabel(`${m.key}-01`)} ({m.count} {m.count === 1 ? 'moment' : 'moments'})</option>
                    ))}
                  </select>
                </div>
              )}

              {kind === 'year' && (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pick a year">
                  {years.map((y) => (
                    <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={year === y} className={chipClass(year === y)}>
                      {y}
                    </button>
                  ))}
                </div>
              )}

              {kind === 'manual' && (
                <div className="mt-3 rounded-2xl border border-border bg-white">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-xs text-ink-muted">{manualIds.size} of {moments.length} selected</span>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setManualIds(new Set(moments.map((m) => m.id)))} className="text-xs font-semibold text-rose">
                        Select all
                      </button>
                      <button type="button" onClick={() => setManualIds(new Set())} className="text-xs font-semibold text-ink-muted">
                        Clear
                      </button>
                    </div>
                  </div>
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                    {[...moments].reverse().map((m) => {
                      const checked = manualIds.has(m.id)
                      return (
                        <li key={m.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                            <input type="checkbox" checked={checked} onChange={() => toggleManual(m.id)} className="sr-only" />
                            <span
                              aria-hidden="true"
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                                checked ? 'border-rose bg-rose text-white' : 'border-border bg-white'
                              )}
                            >
                              {checked && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{m.title}</span>
                              <span className="block text-[11px] text-ink-muted">{formatDateID(m.moment_date)} · {m.photos.length} {m.photos.length === 1 ? 'photo' : 'photos'}</span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Style</p>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Scrapbook style">
                {SCRAPBOOK_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    aria-pressed={style === s.id}
                    className={cn(
                      'rounded-2xl border p-3 text-left transition-colors',
                      style === s.id ? 'border-rose bg-rose-50 shadow-card' : 'border-border bg-white'
                    )}
                  >
                    <span className="block text-sm font-bold text-ink">{s.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{s.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label htmlFor="sb-title" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Cover title <span className="font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="sb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_COVER_TITLE}
                placeholder="Our Story"
                className={fieldClass}
              />
            </section>

            <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
              <p className="text-sm font-bold text-ink">
                {selected.length > 0
                  ? `${selected.length} ${selected.length === 1 ? 'date' : 'dates'} · ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`
                  : 'No moments selected yet'}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {selected.length > 0 ? `${label} · ${selected.length + 1} A4 pages` : 'Change the range or pick some moments first.'}
              </p>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!canPrint}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {preparing ? 'Loading photos...' : 'Print / Save PDF'}
              </button>
              <p className="mt-2 text-center text-[11px] leading-snug text-ink-muted">
                In the print dialog, choose &ldquo;Save as PDF&rdquo;, A4 paper, and turn on background graphics.
              </p>
              {printNote && !preparing && <p className="mt-2 text-center text-xs text-ink-muted">{printNote}</p>}
              {signError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{signError}</p>}
            </div>

            <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">Preview</p>
          </div>

          {/* Preview = what gets printed */}
          {selected.length === 0 ? (
            <div className="mx-6 mt-3 rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center print:hidden">
              <p className="text-sm font-semibold text-ink">No moments in this range</p>
              <p className="mt-1 text-xs text-ink-muted">
                {kind === 'manual' ? 'Select the moments you want to include.' : 'Try another month or year.'}
              </p>
            </div>
          ) : (
            <div className="px-6 pt-3 print:p-0">
              <ScrapbookPages
                ref={pagesRef}
                style={style}
                title={coverTitle}
                names={names}
                range={label}
                moments={selected}
                urls={urlMap}
                onPhotoError={handlePhotoError}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
