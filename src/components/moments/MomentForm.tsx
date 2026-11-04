'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarCheck, Camera, ImagePlus, ListChecks, Loader2, LocateFixed, MapPin, Star, X } from 'lucide-react'
import { todayJakarta } from '@/lib/dates'
import { compressImage, type CompressedImage } from '@/lib/image'
import { formatCoords, getCurrentPosition, reverseGeocode, type Coords } from '@/lib/geo'
import type { PhotoMeta } from '@/lib/exif'
import { autoTitle, formatDayRange, isRecentPhoto, pickPhotoMeta, withCaptureTime } from '@/lib/moment-autofill'
import {
  MAX_DESCRIPTION, MAX_LOCATION, MAX_MOMENT_PHOTOS, MAX_TITLE,
  addMomentPhoto, completeBucketItemWithMoment, createMoment, removeMomentPhotos, setPhotoOrder, touchMoment, updateMoment,
  type CoupleInfo, type MomentPhoto, type MomentPrefill, type MomentWithPhotos,
} from '@/lib/moments'
import SignedPhoto from './SignedPhoto'

// meta/capturedAt: what a photo picked in this form said (capturedAt is set
// for camera shots, which may come without EXIF). Kept after upload so the
// hints and the suggested title don't change halfway through a save.
type FormPhoto =
  | { key: string; kind: 'saved'; photo: MomentPhoto; url: string | null; meta?: PhotoMeta; capturedAt?: string | null }
  | { key: string; kind: 'new'; image: CompressedImage; url: string; meta: PhotoMeta; capturedAt: string | null }

/**
 * Where the date came from. Only 'default' (today) and 'photo' may be
 * replaced by photo dates; 'given' (edit, or a date in the link) and 'user'
 * (picked in the field) never are.
 */
type DateSource = 'default' | 'photo' | 'given' | 'user'

interface Props {
  info: CoupleInfo & { coupleId: string }
  initial?: MomentWithPhotos
  /** Already-validated values from the URL (new moments only) */
  prefill?: MomentPrefill
  /** Photos picked before the form opened ("Add from photos"); new moments only */
  initialFiles?: File[]
}

const fieldClass =
  'w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-muted/60 outline-none transition-colors focus:border-rose focus:ring-2 focus:ring-rose/10'

const chipClass = 'flex items-center gap-1 rounded-full bg-sage/15 px-2.5 py-1 text-[11px] font-medium text-sage-dark'

function autofillMeta(p: FormPhoto): PhotoMeta[] {
  if (!p.meta) return []
  return [p.capturedAt ? withCaptureTime(p.meta, new Date(p.capturedAt)) : p.meta]
}

export default function MomentForm({ info, initial, prefill: prefillProp, initialFiles }: Props) {
  const router = useRouter()
  const isEdit = !!initial
  const prefill = isEdit ? undefined : prefillProp
  const prefillCoords: Coords | null =
    prefill?.latitude !== undefined && prefill?.longitude !== undefined
      ? { latitude: prefill.latitude, longitude: prefill.longitude }
      : null
  const [momentId, setMomentId] = useState<string | null>(initial?.id ?? null)
  const [photos, setPhotos] = useState<FormPhoto[]>(() =>
    (initial?.photos ?? []).map((p) => ({ key: p.id, kind: 'saved' as const, photo: p, url: p.url }))
  )
  const [removed, setRemoved] = useState<MomentPhoto[]>([])
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? '')
  // While true the field shows a title made from the photos; typing makes it the user's.
  const [titleAuto, setTitleAuto] = useState(false)
  const [date, setDate] = useState(initial?.moment_date ?? prefill?.date ?? todayJakarta())
  // A date given in the link wins over photo EXIF, like one the user picked.
  const [dateSource, setDateSource] = useState<DateSource>(isEdit || prefill?.date ? 'given' : 'default')
  const [locationName, setLocationName] = useState(initial?.location_name ?? prefill?.location ?? '')
  const [coords, setCoords] = useState<Coords | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : prefillCoords
  )
  const [coordsSource, setCoordsSource] = useState<'photo' | 'gps' | 'saved' | null>(
    initial?.latitude != null || prefillCoords ? 'saved' : null
  )
  const bucketId = prefill?.bucketId ?? null
  const bucketLinked = useRef(false)
  /** Set once the moment is created; cleared when the "new moment" push is sent. */
  const notifyPartner = useRef(false)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [processing, setProcessing] = useState(false)
  /** Photos being read and shrunk, shown as placeholders */
  const [pending, setPending] = useState(0)
  const [locating, setLocating] = useState(false)
  /** Looking up the place name for coordinates */
  const [naming, setNaming] = useState(false)
  /** "Use where you are" failed: shown next to the offer, which then goes away */
  const [locateError, setLocateError] = useState('')
  const [isIOS, setIsIOS] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** New moments only: a problem with the photos just picked, shown under them */
  const [photoError, setPhotoError] = useState('')
  const galleryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLTextAreaElement>(null)
  const errorBox = useRef<HTMLParagraphElement>(null)
  /** Guards against a second submit before the first one shows progress */
  const submitting = useRef(false)
  /** The save came from "Save now" up top, so errors must be scrolled into view */
  const quickSave = useRef(false)
  const scrollToError = useRef(false)

  // Object URLs for local previews must be released when leaving the page.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => {
    for (const p of photosRef.current) if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url)
  }, [])

  // Latest values for code that resumes after an await (photo processing).
  const latest = useRef({ coords, title, titleAuto, dateSource })
  latest.current = { coords, title, titleAuto, dateSource }

  const today = todayJakarta()
  const busy = processing || !!progress

  // What the photos picked here say (photos saved earlier are never re-read).
  const pickedMetas = useMemo(() => photos.flatMap(autofillMeta), [photos])
  const pick = useMemo(() => pickPhotoMeta(pickedMetas), [pickedMetas])
  const hasPickedPhotos = pickedMetas.length > 0
  const suggestion = titleAuto
    ? autoTitle({
        placeName: locationName,
        // Today as a fallback is not something the photos said.
        date: dateSource === 'default' ? null : date,
        // The photo's time only describes the photo's own day.
        takenAt: pick.date && pick.date === date ? pick.takenAt : null,
      })
    : ''
  const titleValue = titleAuto ? suggestion : title

  // The title field grows with its text (field-sizing isn't in every browser yet).
  useLayoutEffect(() => {
    const el = titleInput.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [titleValue])

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
  }, [])

  // Photos picked on the Moments page: process them once on arrival.
  const initialFilesUsed = useRef(false)
  useEffect(() => {
    if (isEdit || initialFilesUsed.current || !initialFiles?.length) return
    initialFilesUsed.current = true
    addFiles(initialFiles, 'gallery')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, with the photos handed over on open
  }, [])

  async function fillPlaceName(c: Coords) {
    setNaming(true)
    try {
      const name = await reverseGeocode(c)
      if (name) setLocationName((prev) => (prev.trim() ? prev : name))
    } finally {
      setNaming(false)
    }
  }

  /** New moments: the earliest photo date replaces today or an earlier photo date, never a chosen one. */
  function syncDateFromPhotos(next: FormPhoto[]) {
    if (isEdit) return
    const source = latest.current.dateSource
    if (source !== 'default' && source !== 'photo') return
    const earliest = pickPhotoMeta(next.flatMap(autofillMeta)).date
    if (!earliest) return
    setDate(earliest)
    setDateSource('photo')
  }

  async function addFiles(list: FileList | File[] | null, from: 'gallery' | 'camera') {
    if (!list?.length) return
    setError('')
    setPhotoError('')
    // New moments show photo problems by the photos (they may arrive from the
    // Moments page, with the bottom of the form out of sight); edit keeps its place.
    const report = isEdit ? setError : setPhotoError
    const room = MAX_MOMENT_PHOTOS - photosRef.current.length
    const files = Array.from(list)
    if (room <= 0) {
      report(`You already have ${MAX_MOMENT_PHOTOS} photos. Remove one first to swap it.`)
      return
    }
    if (files.length > room) {
      const skipped = files.length - room
      report(`Up to ${MAX_MOMENT_PHOTOS} photos per moment, so ${skipped} ${skipped === 1 ? 'photo was' : 'photos were'} not added.`)
    }

    setProcessing(true)
    setPending(Math.min(files.length, room))
    const capturedAt = from === 'camera' ? new Date().toISOString() : null
    const added: Extract<FormPhoto, { kind: 'new' }>[] = []
    try {
      // Loaded on demand; offline (or after a deploy) the chunk can fail to load.
      const { readPhotoMeta } = await import('@/lib/exif')
      for (const file of files.slice(0, room)) {
        try {
          // EXIF first: re-encoding strips it.
          const meta = await readPhotoMeta(file)
          const image = await compressImage(file)
          added.push({ key: crypto.randomUUID(), kind: 'new', image, url: URL.createObjectURL(image.blob), meta, capturedAt })
        } catch (e) {
          report(e instanceof Error ? e.message : "One of the photos couldn't be processed.")
        }
      }
    } catch {
      report("Couldn't process the photos. Check your connection and try again.")
    } finally {
      setProcessing(false)
      setPending(0)
    }
    if (added.length === 0) return
    const next = [...photosRef.current, ...added].slice(0, MAX_MOMENT_PHOTOS)
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_MOMENT_PHOTOS))

    syncDateFromPhotos(next)
    // Suggest a title only into an empty field, and never in the edit flow.
    if (!isEdit && !latest.current.titleAuto && !latest.current.title.trim()) setTitleAuto(true)

    const located = added.find((p) => p.meta.latitude != null && p.meta.longitude != null)
    if (!latest.current.coords && located) {
      const c = { latitude: located.meta.latitude as number, longitude: located.meta.longitude as number }
      setCoords(c)
      setCoordsSource('photo')
      fillPlaceName(c)
    }
  }

  /** fromOffer: tapped "Taken just now? Use where you are" up top, so a failure is shown there. */
  async function locateMe(fromOffer: boolean) {
    setError('')
    setLocateError('')
    setLocating(true)
    try {
      const c = await getCurrentPosition()
      setCoords(c)
      setCoordsSource('gps')
      await fillPlaceName(c)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't get your location."
      if (fromOffer) setLocateError(message)
      else setError(message)
    } finally {
      setLocating(false)
    }
  }

  function removePhoto(key: string) {
    const target = photos.find((p) => p.key === key)
    if (!target) return
    if (target.kind === 'saved') setRemoved((prev) => [...prev, target.photo])
    else URL.revokeObjectURL(target.url)
    const next = photos.filter((p) => p.key !== key)
    setPhotos((prev) => prev.filter((p) => p.key !== key))
    setPhotoError('')
    syncDateFromPhotos(next)
  }

  function clearTitle() {
    setTitleAuto(false)
    setTitle('')
    titleInput.current?.focus()
  }

  function fail(message: string) {
    // The message sits by the bottom button, out of sight from "Save now".
    if (quickSave.current) scrollToError.current = true
    setError(message)
  }

  useEffect(() => {
    if (!error || !scrollToError.current) return
    scrollToError.current = false
    errorBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  function makeCover(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key)
      return target ? [target, ...prev.filter((p) => p.key !== key)] : prev
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || submitting.current) return
    const cleanTitle = titleValue.trim()
    if (!cleanTitle) return fail('Give this moment a title first.')
    if (!date) return fail('Pick a date for this moment.')
    if (date > today) return fail("A moment's date can't be in the future.")
    if (photos.length === 0) return fail('Add at least 1 photo.')
    setError('')
    setPhotoError('')
    submitting.current = true
    // Saving makes the suggested title the moment's own, so it can't change
    // under a retry (the place name may still arrive).
    if (titleAuto) {
      setTitle(cleanTitle)
      setTitleAuto(false)
    }

    const input = {
      title: cleanTitle.slice(0, MAX_TITLE),
      moment_date: date,
      description: description.trim().slice(0, MAX_DESCRIPTION) || null,
      location_name: locationName.trim().slice(0, MAX_LOCATION) || null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    }

    let id = momentId
    try {
      setProgress('Saving moment...')
      if (id) {
        await updateMoment(id, input)
      } else {
        id = (await createMoment(info.coupleId, info.userId, input)).id
        setMomentId(id)
        // A later step may fail; the retry must still tell the partner.
        notifyPartner.current = true
      }

      if (removed.length > 0) {
        setProgress('Removing photos...')
        await removeMomentPhotos(removed)
        setRemoved([])
      }

      // Upload in display order; each finished photo becomes "saved" in state so
      // a retry after a failure doesn't upload it twice.
      const current = [...photos]
      const total = current.filter((p) => p.kind === 'new').length
      let done = 0
      for (let i = 0; i < current.length; i++) {
        const item = current[i]
        if (item.kind !== 'new') continue
        setProgress(`Uploading photo ${++done}/${total}...`)
        const saved = await addMomentPhoto(info.coupleId, id, item.image, i, item.meta.takenAt)
        const next: FormPhoto = { key: saved.id, kind: 'saved', photo: saved, url: item.url, meta: item.meta, capturedAt: item.capturedAt }
        current[i] = next
        setPhotos((prev) => prev.map((p) => (p.key === item.key ? next : p)))
      }

      setProgress('Ordering photos...')
      const photoIds = current.map((p) => (p.kind === 'saved' ? p.photo.id : '')).filter(Boolean)
      await setPhotoOrder(photoIds)

      // Photo rows send no live events, and the moment's own event went out
      // before the uploads: touch it so the partner reloads the final photos.
      // Not worth failing the save over (their list re-checks for a while).
      if (photoIds.join(',') !== (initial?.photos ?? []).map((p) => p.id).join(',')) {
        await touchMoment(id).catch(() => undefined)
      }

      // Came from the bucket list: tick that item off and link it here. The
      // moment is already saved, so a failure here must not block the user.
      if (bucketId && !bucketLinked.current) {
        bucketLinked.current = true
        setProgress('Ticking off your bucket list...')
        await completeBucketItemWithMoment(bucketId, id).catch(() => undefined)
      }

      if (notifyPartner.current && info.partnerId) {
        notifyPartner.current = false
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: info.partnerId,
            title: 'Nanti Kita',
            body: `${info.names[info.userId] ?? 'Your partner'} saved a moment: "${input.title}"`,
            url: `/app/moments/${id}`,
            kind: 'moments',
          }),
        }).catch(() => undefined)
      }

      router.replace(`/app/moments/${id}`)
      router.refresh()
    } catch (err) {
      submitting.current = false
      setProgress(null)
      fail(err instanceof Error ? err.message : "Couldn't save the moment. Try again.")
    }
  }

  // ── Quick Moment hints (new moments with picked photos only) ──
  const autofillOn = !isEdit && hasPickedPhotos
  const dateFromPhoto = autofillOn && dateSource === 'photo'
  const placeFromPhoto = autofillOn && coordsSource === 'photo'
  const placeFromHere = autofillOn && coordsSource === 'gps'
  const placeEmpty = !coords && !locationName.trim()
  // No GPS in the photos (pickers often strip it), but they are fresh: where
  // the phone is now is most likely where they were taken.
  const offerLocate = autofillOn && placeEmpty && !pick.coords && !locateError && isRecentPhoto(pick.newestTakenAt)
  const spanNote = dateFromPhoto && pick.days > 1 && pick.date && pick.lastDate && date === pick.date
    ? `Photos from ${formatDayRange(pick.date, pick.lastDate)}. The date is set to the first day.`
    : null
  const noDate = autofillOn && dateSource === 'default' && !pick.from.date
  const noPlace = autofillOn && placeEmpty && !pick.coords && !offerLocate && !naming
  const missingNote = [
    noDate && noPlace
      ? 'These photos have no date or location, so the date is set to today.'
      : noDate
        ? 'No date in these photos, so the date is set to today.'
        : noPlace
          ? 'No location in these photos.'
          : '',
    noPlace && isIOS ? 'On iPhone, tap Options in the photo picker and turn on Location.' : '',
  ].filter(Boolean).join(' ')
  // A save button up here, so saving needs no scrolling. It stays while its own save runs.
  const showQuickSave = autofillOn && !!titleValue.trim() && !!date && !naming && (!busy || (!!progress && quickSave.current))

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 py-5">
        <Link
          href={initial ? `/app/moments/${initial.id}` : '/app/moments'}
          className="mb-3 flex items-center gap-1 text-sm text-ink-muted"
        >
          <ArrowLeft className="h-4 w-4" /> {initial ? 'Back to moment' : 'Moments'}
        </Link>
        <h1 className="text-xl font-bold text-ink">{isEdit ? 'Edit moment' : 'New moment'}</h1>
        <p className="text-sm text-ink-muted">Save your dates here. Later they can become a scrapbook.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 px-6 pt-5">
        {bucketId && (
          <p className="flex items-start gap-2 rounded-2xl bg-sage/15 px-4 py-3 text-xs leading-relaxed text-sage-dark">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
            Once you save, this bucket list item gets ticked off and linked to this moment.
          </p>
        )}

        {/* Photos */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Photos</p>
            <span className="text-xs text-ink-muted">{photos.length}/{MAX_MOMENT_PHOTOS}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-rose-50">
                {p.kind === 'saved' && p.url ? (
                  <SignedPhoto src={p.url} path={p.photo.storage_path} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                ) : p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-ink-muted">Photo</div>
                )}
                {i === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-rose px-2 py-0.5 text-[10px] font-bold text-white">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeCover(p.key)}
                    disabled={busy}
                    aria-label="Make cover"
                    className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.key)}
                  disabled={busy}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {Array.from({ length: Math.min(pending, MAX_MOMENT_PHOTOS - photos.length) }, (_, i) => (
              <div key={`pending-${i}`} aria-hidden className="aspect-square animate-pulse rounded-xl bg-rose-50" />
            ))}

            {photos.length + pending < MAX_MOMENT_PHOTOS && (
              <div className="flex aspect-square flex-col overflow-hidden rounded-xl border-2 border-dashed border-rose/30 bg-white">
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 text-xs font-semibold text-rose"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Gallery
                </button>
                <div className="h-px bg-rose/15" />
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 text-xs font-semibold text-rose"
                >
                  <Camera className="h-4 w-4" /> Camera
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-muted">
            The first photo is the cover. Date and place fill in from the photo when it has them.
          </p>
          {processing && <span role="status" className="sr-only">Reading your photos...</span>}
          {photoError && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{photoError}</p>}

          {/* What the photos filled in (new moments only) */}
          {autofillOn && (
            <div className="mt-3 space-y-2">
              {(dateFromPhoto || placeFromPhoto || placeFromHere || offerLocate || showQuickSave) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {dateFromPhoto && (
                    <span className={chipClass}>
                      <CalendarCheck className="h-3.5 w-3.5" /> Date from photo
                    </span>
                  )}
                  {placeFromPhoto && (
                    <span className={chipClass}>
                      <MapPin className="h-3.5 w-3.5" /> Place from photo
                    </span>
                  )}
                  {placeFromHere && (
                    <span className={chipClass}>
                      <LocateFixed className="h-3.5 w-3.5" /> Place from where you are
                    </span>
                  )}
                  {offerLocate && (
                    <button
                      type="button"
                      onClick={() => locateMe(true)}
                      disabled={busy || locating}
                      className="flex items-center gap-1 rounded-full border border-rose/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose disabled:opacity-60"
                    >
                      {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                      {locating ? 'Finding you...' : 'Taken just now? Use where you are'}
                    </button>
                  )}
                  {showQuickSave && (
                    <button
                      type="submit"
                      onClick={() => { quickSave.current = true }}
                      disabled={busy}
                      className="ml-auto flex items-center gap-1.5 rounded-full bg-rose px-3.5 py-1.5 text-xs font-bold text-white shadow-card transition-all active:scale-[0.97] disabled:opacity-60"
                    >
                      {progress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {progress ? 'Saving...' : 'Save now'}
                    </button>
                  )}
                </div>
              )}
              {locateError && <p role="alert" className="text-[11px] leading-snug text-red-600">{locateError}</p>}
              {spanNote && <p className="text-[11px] leading-snug text-ink-muted">{spanNote}</p>}
              {missingNote && <p className="text-[11px] leading-snug text-ink-muted">{missingNote}</p>}
            </div>
          )}

          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { addFiles(e.target.files, 'gallery'); e.target.value = '' }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { addFiles(e.target.files, 'camera'); e.target.value = '' }}
          />
        </section>

        {/* Title */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="moment-title" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Title
            </label>
            {titleAuto && (
              <span id="moment-title-hint" className="text-[11px] text-ink-muted">Suggested, tap to edit</span>
            )}
          </div>
          <div className="relative">
            {/* One line that grows, so a long suggested title can be read in full.
                Enter still saves, like the single-line field it replaces. */}
            <textarea
              id="moment-title"
              ref={titleInput}
              rows={1}
              value={titleValue}
              onChange={(e) => { setTitleAuto(false); setTitle(e.target.value.replace(/[\r\n]+/g, ' ')) }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                e.preventDefault()
                quickSave.current = false
                e.currentTarget.form?.requestSubmit()
              }}
              enterKeyHint="done"
              maxLength={MAX_TITLE}
              placeholder="e.g. First dinner in Kemang"
              aria-describedby={titleAuto ? 'moment-title-hint' : undefined}
              className={`${fieldClass} block resize-none overflow-hidden${titleAuto ? ' pr-11' : ''}`}
            />
            {titleAuto && (
              <button
                type="button"
                onClick={clearTitle}
                aria-label="Clear the suggested title"
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Date */}
        <div>
          <label htmlFor="moment-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Date
          </label>
          <input
            id="moment-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => { setDateSource('user'); setDate(e.target.value) }}
            className={fieldClass}
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="moment-location" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Place
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="moment-location"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              maxLength={200}
              placeholder={naming && !locationName ? 'Finding the place name...' : 'Place name'}
              className={`${fieldClass} pl-10`}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => locateMe(false)}
              disabled={busy || locating}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-ink-light disabled:opacity-50"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5 text-rose" />}
              {locating ? 'Finding you...' : 'Use my location'}
            </button>
            {coords && (
              <span className="flex items-center gap-1 rounded-xl bg-sage/15 px-3 py-2 text-[11px] font-medium text-sage-dark">
                {formatCoords(coords)}
                {coordsSource === 'photo' && ' · from photo'}
                {coordsSource === 'gps' && ' · GPS'}
                <button
                  type="button"
                  onClick={() => { setCoords(null); setCoordsSource(null) }}
                  aria-label="Clear coordinates"
                  className="ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="moment-desc" className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Story
            </label>
            <span className={`text-xs ${description.length > MAX_DESCRIPTION * 0.9 ? 'text-rose' : 'text-ink-muted'}`}>
              {description.length}/{MAX_DESCRIPTION}
            </span>
          </div>
          <textarea
            id="moment-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            rows={5}
            placeholder="What stuck with you most from this day?"
            className={`${fieldClass} resize-none leading-relaxed`}
          />
        </div>

        {error && <p ref={errorBox} className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          onClick={() => { quickSave.current = false }}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-4 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {progress && <Loader2 className="h-4 w-4 animate-spin" />}
          {progress ?? (isEdit ? 'Save changes' : 'Save moment')}
        </button>
      </form>
    </div>
  )
}
