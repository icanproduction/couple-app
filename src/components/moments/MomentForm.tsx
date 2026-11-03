'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, ImagePlus, ListChecks, Loader2, LocateFixed, MapPin, Star, X } from 'lucide-react'
import { todayJakarta } from '@/lib/dates'
import { compressImage, type CompressedImage } from '@/lib/image'
import { formatCoords, getCurrentPosition, reverseGeocode, type Coords } from '@/lib/geo'
import type { PhotoMeta } from '@/lib/exif'
import {
  MAX_DESCRIPTION, MAX_LOCATION, MAX_MOMENT_PHOTOS, MAX_TITLE,
  addMomentPhoto, completeBucketItemWithMoment, createMoment, removeMomentPhotos, setPhotoOrder, touchMoment, updateMoment,
  type CoupleInfo, type MomentPhoto, type MomentPrefill, type MomentWithPhotos,
} from '@/lib/moments'
import SignedPhoto from './SignedPhoto'

type FormPhoto =
  | { key: string; kind: 'saved'; photo: MomentPhoto; url: string | null }
  | { key: string; kind: 'new'; image: CompressedImage; url: string; meta: PhotoMeta }

interface Props {
  info: CoupleInfo & { coupleId: string }
  initial?: MomentWithPhotos
  /** Already-validated values from the URL (new moments only) */
  prefill?: MomentPrefill
}

const fieldClass =
  'w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-muted/60 outline-none transition-colors focus:border-rose focus:ring-2 focus:ring-rose/10'

export default function MomentForm({ info, initial, prefill: prefillProp }: Props) {
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
  const [date, setDate] = useState(initial?.moment_date ?? prefill?.date ?? todayJakarta())
  // A date given in the link wins over photo EXIF, like one the user picked.
  const dateTouched = useRef(isEdit || !!prefill?.date)
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
  const [locating, setLocating] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const galleryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  // Object URLs for local previews must be released when leaving the page.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => {
    for (const p of photosRef.current) if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url)
  }, [])

  const today = todayJakarta()
  const busy = processing || !!progress

  async function fillPlaceName(c: Coords) {
    const name = await reverseGeocode(c)
    if (name) setLocationName((prev) => (prev.trim() ? prev : name))
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return
    setError('')
    const room = MAX_MOMENT_PHOTOS - photosRef.current.length
    const files = Array.from(list)
    if (room <= 0) {
      setError(`Sudah ${MAX_MOMENT_PHOTOS} foto. Hapus satu dulu kalau mau ganti.`)
      return
    }
    if (files.length > room) {
      setError(`Maksimal ${MAX_MOMENT_PHOTOS} foto per moment — ${files.length - room} foto tidak ditambahkan.`)
    }

    setProcessing(true)
    const added: Extract<FormPhoto, { kind: 'new' }>[] = []
    try {
      // Loaded on demand; offline (or after a deploy) the chunk can fail to load.
      const { readPhotoMeta } = await import('@/lib/exif')
      for (const file of files.slice(0, room)) {
        try {
          // EXIF first: re-encoding strips it.
          const meta = await readPhotoMeta(file)
          const image = await compressImage(file)
          added.push({ key: crypto.randomUUID(), kind: 'new', image, url: URL.createObjectURL(image.blob), meta })
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Ada foto yang gagal diproses.')
        }
      }
    } catch {
      setError('Foto belum bisa diproses. Cek koneksimu, lalu coba lagi.')
    } finally {
      setProcessing(false)
    }
    if (added.length === 0) return
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_MOMENT_PHOTOS))

    const dated = added.find((p) => p.meta.date && p.meta.date <= today)
    if (!dateTouched.current && dated?.meta.date) setDate(dated.meta.date)

    const located = added.find((p) => p.meta.latitude != null && p.meta.longitude != null)
    if (!coords && located) {
      const c = { latitude: located.meta.latitude as number, longitude: located.meta.longitude as number }
      setCoords(c)
      setCoordsSource('photo')
      fillPlaceName(c)
    }
  }

  async function locateMe() {
    setError('')
    setLocating(true)
    try {
      const c = await getCurrentPosition()
      setCoords(c)
      setCoordsSource('gps')
      await fillPlaceName(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengambil lokasi.')
    } finally {
      setLocating(false)
    }
  }

  function removePhoto(key: string) {
    const target = photos.find((p) => p.key === key)
    if (!target) return
    if (target.kind === 'saved') setRemoved((prev) => [...prev, target.photo])
    else URL.revokeObjectURL(target.url)
    setPhotos((prev) => prev.filter((p) => p.key !== key))
  }

  function makeCover(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key)
      return target ? [target, ...prev.filter((p) => p.key !== key)] : prev
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const cleanTitle = title.trim()
    if (!cleanTitle) return setError('Kasih judul moment-nya dulu ya.')
    if (!date) return setError('Pilih tanggal moment-nya.')
    if (date > today) return setError('Tanggal moment tidak boleh di masa depan.')
    if (photos.length === 0) return setError('Tambahkan minimal 1 foto.')
    setError('')

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
      setProgress('Menyimpan moment...')
      if (id) {
        await updateMoment(id, input)
      } else {
        id = (await createMoment(info.coupleId, info.userId, input)).id
        setMomentId(id)
        // A later step may fail; the retry must still tell the partner.
        notifyPartner.current = true
      }

      if (removed.length > 0) {
        setProgress('Menghapus foto...')
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
        setProgress(`Mengunggah foto ${++done}/${total}...`)
        const saved = await addMomentPhoto(info.coupleId, id, item.image, i, item.meta.takenAt)
        const next: FormPhoto = { key: saved.id, kind: 'saved', photo: saved, url: item.url }
        current[i] = next
        setPhotos((prev) => prev.map((p) => (p.key === item.key ? next : p)))
      }

      setProgress('Menyusun foto...')
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
        setProgress('Mencentang bucket list...')
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
            body: `${info.names[info.userId] ?? 'Pasanganmu'} menyimpan moment "${input.title}"`,
            url: `/app/moments/${id}`,
            kind: 'moments',
          }),
        }).catch(() => undefined)
      }

      router.replace(`/app/moments/${id}`)
      router.refresh()
    } catch (err) {
      setProgress(null)
      setError(err instanceof Error ? err.message : 'Gagal menyimpan moment. Coba lagi.')
    }
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 py-5">
        <Link
          href={initial ? `/app/moments/${initial.id}` : '/app/moments'}
          className="mb-3 flex items-center gap-1 text-sm text-ink-muted"
        >
          <ArrowLeft className="h-4 w-4" /> {initial ? 'Kembali ke moment' : 'Moment Kita'}
        </Link>
        <h1 className="text-xl font-bold text-ink">{isEdit ? 'Edit Moment' : 'Moment Baru'}</h1>
        <p className="text-sm text-ink-muted">Abadikan date kalian — nanti bisa jadi scrapbook</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 px-6 pt-5">
        {bucketId && (
          <p className="flex items-start gap-2 rounded-2xl bg-sage/15 px-4 py-3 text-xs leading-relaxed text-sage-dark">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
            Setelah disimpan, item bucket list ini otomatis dicentang dan terhubung ke moment ini.
          </p>
        )}

        {/* Photos */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Foto</p>
            <span className="text-xs text-ink-muted">{photos.length}/{MAX_MOMENT_PHOTOS}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-rose-50">
                {p.kind === 'saved' && p.url ? (
                  <SignedPhoto src={p.url} path={p.photo.storage_path} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                ) : p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={p.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-ink-muted">Foto</div>
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
                    aria-label="Jadikan cover"
                    className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.key)}
                  disabled={busy}
                  aria-label="Hapus foto"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {photos.length < MAX_MOMENT_PHOTOS && (
              <div className="flex aspect-square flex-col overflow-hidden rounded-xl border-2 border-dashed border-rose/30 bg-white">
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 text-xs font-semibold text-rose"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Galeri
                </button>
                <div className="h-px bg-rose/15" />
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 text-xs font-semibold text-rose"
                >
                  <Camera className="h-4 w-4" /> Kamera
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-muted">
            Foto pertama jadi cover. Tanggal & lokasi diisi otomatis dari foto kalau tersedia.
          </p>
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
        </section>

        {/* Title */}
        <div>
          <label htmlFor="moment-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Judul Moment
          </label>
          <input
            id="moment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="Contoh: Dinner pertama di Kemang"
            className={fieldClass}
          />
        </div>

        {/* Date */}
        <div>
          <label htmlFor="moment-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Tanggal
          </label>
          <input
            id="moment-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => { dateTouched.current = true; setDate(e.target.value) }}
            className={fieldClass}
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="moment-location" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Lokasi
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              id="moment-location"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              maxLength={200}
              placeholder="Nama tempat"
              className={`${fieldClass} pl-10`}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={locateMe}
              disabled={busy || locating}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-ink-light disabled:opacity-50"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5 text-rose" />}
              {locating ? 'Mencari lokasi...' : 'Pakai lokasi sekarang'}
            </button>
            {coords && (
              <span className="flex items-center gap-1 rounded-xl bg-sage/15 px-3 py-2 text-[11px] font-medium text-sage-dark">
                {formatCoords(coords)}
                {coordsSource === 'photo' && ' · dari foto'}
                {coordsSource === 'gps' && ' · GPS'}
                <button
                  type="button"
                  onClick={() => { setCoords(null); setCoordsSource(null) }}
                  aria-label="Hapus koordinat"
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
              Cerita
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
            placeholder="Apa yang paling berkesan dari hari ini?"
            className={`${fieldClass} resize-none leading-relaxed`}
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-4 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {progress && <Loader2 className="h-4 w-4 animate-spin" />}
          {progress ?? (isEdit ? 'Simpan Perubahan' : 'Simpan Moment')}
        </button>
      </form>
    </div>
  )
}
