'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Pencil, Star, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import MomentSocial from '@/components/moments/MomentSocial'
import PhotoLightbox from '@/components/moments/PhotoLightbox'
import SignedPhoto from '@/components/moments/SignedPhoto'
import { formatDateID } from '@/lib/dates'
import { formatCoords, googleMapsUrl, osmEmbedUrl } from '@/lib/geo'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import {
  deleteMoment, getCoupleInfo, getMoment, setMomentFavorite,
  type CoupleInfo, type MomentWithPhotos,
} from '@/lib/moments'

export default function MomentDetailPage() {
  const router = useRouter()
  const { momentId } = useParams<{ momentId: string }>()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [moment, setMoment] = useState<MomentWithPhotos | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const i = await getCoupleInfo()
        if (!i) { router.replace('/auth/login'); return }
        const m = await getMoment(momentId)
        if (!cancelled) { setInfo(i); setMoment(m) }
      } catch {
        if (!cancelled) setError('Gagal memuat moment. Coba buka ulang halaman ini.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [momentId, router])

  // Partner edits / favourites show up live (signed URLs are reused, so photos don't reload).
  const refresh = useCallback(() => {
    if (deleting) return
    getMoment(momentId).then((m) => { if (m) setMoment(m) }).catch(() => undefined)
  }, [momentId, deleting])
  useCoupleRealtime(info?.coupleId, ['moments'], refresh)

  async function toggleFavorite() {
    if (!moment || savingFavorite) return
    const next = !moment.is_favorite
    setError('')
    setSavingFavorite(true)
    setMoment({ ...moment, is_favorite: next })
    try {
      await setMomentFavorite(moment.id, next)
    } catch {
      setMoment((m) => (m ? { ...m, is_favorite: !next } : m))
      setError('Gagal mengubah favorit. Coba lagi.')
    } finally {
      setSavingFavorite(false)
    }
  }

  async function handleDelete() {
    if (!moment || deleting) return
    setDeleting(true)
    try {
      await deleteMoment(moment)
      router.replace('/app/moments')
      router.refresh()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
      setError('Gagal menghapus moment. Coba lagi.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 px-6 pt-6">
        <div className="aspect-[4/5] animate-pulse rounded-3xl bg-rose-50" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-rose-50" />
      </div>
    )
  }

  if (!moment) {
    return (
      <div className="px-8 pt-16 text-center">
        <p className="text-sm text-ink-muted">{error || 'Moment ini tidak ditemukan atau sudah dihapus.'}</p>
        <Link href="/app/moments" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Moment Kita</Link>
      </div>
    )
  }

  const shown = moment.photos.filter((p): p is typeof p & { url: string } => !!p.url)
  const coords = moment.latitude != null && moment.longitude != null
    ? { latitude: moment.latitude, longitude: moment.longitude }
    : null
  const author = moment.created_by ? info?.names[moment.created_by] : null

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <Link href="/app/moments" className="flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Moment Kita
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={savingFavorite}
            aria-label={moment.is_favorite ? 'Hapus dari favorit' : 'Tandai sebagai favorit'}
            aria-pressed={moment.is_favorite}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition-transform active:scale-90',
              moment.is_favorite ? 'border-gold text-gold' : 'border-border text-ink-light'
            )}
          >
            <Star className={cn('h-4 w-4', moment.is_favorite && 'fill-gold')} />
          </button>
          <Link
            href={`/app/moments/${moment.id}/edit`}
            aria-label="Edit moment"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-ink-light"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Hapus moment"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Gallery */}
      {shown.length > 0 && (
        <div className="px-6">
          <button onClick={() => setLightbox(0)} className="block w-full overflow-hidden rounded-3xl bg-rose-50 shadow-card">
            <SignedPhoto src={shown[0].url} path={shown[0].storage_path} alt={moment.title} className="aspect-[4/5] w-full object-cover" />
          </button>
          {shown.length > 1 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {shown.slice(1).map((p, i) => (
                <button key={p.id} onClick={() => setLightbox(i + 1)} className="overflow-hidden rounded-xl bg-rose-50">
                  <SignedPhoto
                    src={p.url}
                    path={p.storage_path}
                    alt={`Foto ${i + 2}`}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-5 px-6 pt-5">
        <div>
          <h1 className="text-2xl font-bold leading-tight text-ink">{moment.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
            <CalendarDays className="h-4 w-4 text-rose" /> {formatDateID(moment.moment_date)}
          </p>
          {moment.location_name && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-light">
              <MapPin className="h-4 w-4 shrink-0 text-rose" /> {moment.location_name}
            </p>
          )}
        </div>

        {moment.description && (
          <p className="whitespace-pre-line rounded-2xl border border-border bg-white p-4 text-sm leading-relaxed text-ink-light">
            {moment.description}
          </p>
        )}

        {coords && (
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            <iframe
              title="Peta lokasi moment"
              src={osmEmbedUrl(coords)}
              loading="lazy"
              className="h-48 w-full border-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs text-ink-muted">{formatCoords(coords)}</span>
              <a
                href={googleMapsUrl(coords)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-rose"
              >
                Buka di Maps <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {info?.coupleId && (
          <MomentSocial
            momentId={moment.id}
            momentTitle={moment.title}
            info={{ ...info, coupleId: info.coupleId }}
          />
        )}

        {author && (
          <p className="text-center text-xs text-ink-muted">
            Disimpan oleh {moment.created_by === info?.userId ? 'kamu' : author}
          </p>
        )}
      </div>

      {lightbox !== null && (
        <PhotoLightbox photos={shown} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}

      <Modal open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} title="Hapus moment ini?">
        <p className="text-sm leading-relaxed text-ink-muted">
          &ldquo;{moment.title}&rdquo; dan {moment.photos.length} fotonya akan dihapus untuk kalian berdua. Ini tidak bisa dibatalkan.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="flex-1 rounded-2xl border border-border bg-white py-3 text-sm font-semibold text-ink-light"
          >
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-2xl bg-danger py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {deleting ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
