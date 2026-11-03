'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, ChevronRight, LocateFixed, Map as MapIcon, MapPin, Star } from 'lucide-react'
import MomentsMap, { type MappedMoment, type MomentsMapHandle } from '@/components/moments/MomentsMap'
import SignedPhoto from '@/components/moments/SignedPhoto'
import { formatDateID } from '@/lib/dates'
import { useCoupleRealtime } from '@/lib/realtime'
import { getCoupleInfo, listMoments, type MomentWithPhotos } from '@/lib/moments'

function hasCoords(m: MomentWithPhotos): m is MappedMoment {
  return m.latitude != null && m.longitude != null
}

export default function MomentsMapPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [moments, setMoments] = useState<MomentWithPhotos[]>([])
  const [hasCouple, setHasCouple] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const mapHandle = useRef<MomentsMapHandle>(null)
  const loaded = useRef(false)

  const load = useCallback(async (id: string) => {
    try {
      setMoments(await listMoments(id))
      loaded.current = true
      setError('')
      setRefreshError('')
    } catch {
      // Only the first load may replace the page; a failed refresh keeps the map.
      if (loaded.current) setRefreshError("Couldn't refresh the map. What you see may be out of date.")
      else setError("Couldn't load the map. Try opening this page again.")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const info = await getCoupleInfo()
        if (!info) { router.replace('/auth/login'); return }
        if (!info.coupleId) { if (!cancelled) setHasCouple(false); return }
        if (cancelled) return
        setCoupleId(info.coupleId)
        await load(info.coupleId)
      } catch {
        if (!cancelled) setError("Couldn't load the map. Try opening this page again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router, load])

  useCoupleRealtime(coupleId, ['moments'], () => { if (coupleId) load(coupleId) })

  const mapped = useMemo(() => moments.filter(hasCoords), [moments])
  const withoutGps = moments.length - mapped.length
  const placeCount = useMemo(
    () => new Set(mapped.map((m) => (m.location_name?.trim().toLowerCase() || `${m.latitude.toFixed(3)},${m.longitude.toFixed(3)}`))).size,
    [mapped]
  )

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-5">
        <Link href="/app/moments" className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Moments
        </Link>
        <h1 className="text-xl font-bold text-ink">Moments Map</h1>
        <p className="text-sm text-ink-muted">
          {mapped.length > 0
            ? `${mapped.length} ${mapped.length === 1 ? 'moment' : 'moments'} · ${placeCount} ${placeCount === 1 ? 'place' : 'places'}`
            : 'Every place your dates have taken you'}
        </p>
      </div>

      {refreshError && !error && (
        <p role="status" className="mx-6 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{refreshError}</p>
      )}

      {loading ? (
        <div className="space-y-3 px-6 pt-5">
          <div className="h-80 animate-pulse rounded-2xl bg-rose-50" />
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : error ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : !hasCouple ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Connect with your partner first to start saving moments.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : mapped.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sage/15">
            <MapIcon className="h-8 w-8 text-sage-dark" />
          </div>
          <h2 className="text-lg font-bold text-ink">No moments with a location yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            {moments.length > 0
              ? "Your moments don't have a GPS point yet. Edit one and add your current location, or use a photo that has location data."
              : 'Save a moment with a photo that has location data, or add your current location while you are on the date.'}
          </p>
          <Link
            href={
              moments.length > 0 ? '/app/moments' : '/app/moments/baru'
            }
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            {moments.length > 0 ? 'Back to Moments' : 'Save a moment'}
          </Link>
        </div>
      ) : (
        <div className="px-6 pt-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            <MomentsMap ref={mapHandle} moments={mapped} className="h-[22rem] w-full bg-rose-50" />
          </div>
          {withoutGps > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <LocateFixed className="h-3.5 w-3.5 shrink-0" />
              {withoutGps === 1
                ? "1 moment has no GPS point, so it isn't on the map."
                : `${withoutGps} moments have no GPS point, so they aren't on the map.`}
            </p>
          )}

          <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-ink-muted">Your places</p>
          <ul className="space-y-2.5">
            {mapped.map((m) => {
              const cover = m.photos[0]
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-2.5 shadow-card">
                  <button
                    type="button"
                    onClick={() => mapHandle.current?.focus(m.id)}
                    aria-label={`Show "${m.title}" on the map`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-rose-50">
                      {cover?.url ? (
                        <SignedPhoto src={cover.url} path={cover.storage_path} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center"><Camera className="h-5 w-5 text-rose/40" /></span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-bold text-ink">
                        {m.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Favorite" />}
                        <span className="truncate">{m.title}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <MapPin className="h-3 w-3 shrink-0 text-rose" />
                        <span className="truncate">{m.location_name || 'Unnamed place'}</span>
                      </span>
                      <span className="block text-[11px] text-ink-muted">{formatDateID(m.moment_date)}</span>
                    </span>
                  </button>
                  <Link
                    href={`/app/moments/${m.id}`}
                    aria-label={`Open "${m.title}"`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
