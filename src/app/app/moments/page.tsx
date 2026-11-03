'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookHeart, Camera, Images, Map as MapIcon, MapPin, Plus, Search, SearchX, Star, X } from 'lucide-react'
import SignedPhoto from '@/components/moments/SignedPhoto'
import { formatDateID } from '@/lib/dates'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { getCoupleInfo, listMoments, monthLabel, setMomentFavorite, type MomentWithPhotos } from '@/lib/moments'

type Filter = 'all' | 'favorite' | number

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
    active ? 'bg-rose text-white shadow-card' : 'border border-border bg-white text-ink-light'
  )

export default function MomentsPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [moments, setMoments] = useState<MomentWithPhotos[]>([])
  const [hasCouple, setHasCouple] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [actionError, setActionError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const retries = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  const loaded = useRef(false)

  const load = useCallback(async (id: string) => {
    try {
      const list = await listMoments(id)
      if (!alive.current) return
      loaded.current = true
      setMoments(list)
      setError('')
      setRefreshError('')
      // A partner's moment arrives (via realtime) before its photos finish
      // uploading, and photo rows don't send live events. The form touches the
      // moment once its photos are done; until then (no photos yet, or photos
      // newer than the last update) look again shortly.
      if (retryTimer.current) clearTimeout(retryTimer.current)
      const uploading = list.some((m) => {
        const updated = Date.parse(m.updated_at)
        if (Date.now() - updated > 3 * 60_000) return false
        return m.photos.length === 0 || m.photos.some((p) => Date.parse(p.created_at) > updated)
      })
      if (uploading && retries.current < 12) {
        retries.current += 1
        retryTimer.current = setTimeout(() => load(id), 5000)
      } else if (!uploading) {
        retries.current = 0
      }
    } catch {
      if (!alive.current) return
      // Only the first load may replace the page; a failed refresh keeps what's shown.
      if (loaded.current) setRefreshError('Gagal memperbarui moment. Yang tampil mungkin belum yang terbaru.')
      else setError('Gagal memuat moment. Coba buka ulang halaman ini.')
    }
  }, [])

  useEffect(() => {
    alive.current = true
    ;(async () => {
      try {
        const info = await getCoupleInfo()
        if (!info) { router.replace('/auth/login'); return }
        if (!info.coupleId) { if (alive.current) setHasCouple(false); return }
        setCoupleId(info.coupleId)
        await load(info.coupleId)
      } catch {
        if (alive.current) setError('Gagal memuat moment. Coba buka ulang halaman ini.')
      } finally {
        if (alive.current) setLoading(false)
      }
    })()
    return () => {
      alive.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [router, load])

  useCoupleRealtime(coupleId, ['moments'], () => { if (coupleId) load(coupleId) })

  async function toggleFavorite(m: MomentWithPhotos) {
    const next = !m.is_favorite
    setActionError('')
    setMoments((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_favorite: next } : x)))
    try {
      await setMomentFavorite(m.id, next)
    } catch {
      setMoments((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_favorite: !next } : x)))
      setActionError('Gagal mengubah favorit. Coba lagi.')
    }
  }

  const years = useMemo(
    () => Array.from(new Set(moments.map((m) => Number(m.moment_date.slice(0, 4))))).sort((a, b) => b - a),
    [moments]
  )
  const favoriteCount = moments.filter((m) => m.is_favorite).length

  // A year chip can vanish after an edit; fall back to "Semua".
  useEffect(() => {
    if (typeof filter === 'number' && !years.includes(filter)) setFilter('all')
  }, [filter, years])

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('id-ID')
    return moments.filter((m) => {
      if (filter === 'favorite' && !m.is_favorite) return false
      if (typeof filter === 'number' && !m.moment_date.startsWith(`${filter}-`)) return false
      if (!q) return true
      return [m.title, m.location_name, m.description].some((field) => field?.toLocaleLowerCase('id-ID').includes(q))
    })
  }, [moments, query, filter])

  // Group by month, keeping the newest-first order from the query.
  const groups: { label: string; items: MomentWithPhotos[] }[] = []
  for (const m of visible) {
    const label = monthLabel(m.moment_date)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(m)
    else groups.push({ label, items: [m] })
  }
  const photoCount = moments.reduce((sum, m) => sum + m.photos.length, 0)
  const filtering = query.trim() !== '' || filter !== 'all'

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">Moment Kita</h1>
            <p className="text-sm text-ink-muted">
              {moments.length > 0 ? `${moments.length} moment · ${photoCount} foto` : 'Setiap date, tersimpan di sini'}
            </p>
          </div>
          {hasCouple && (
            <Link
              href="/app/moments/baru"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl bg-rose px-4 py-2.5 text-xs font-bold text-white shadow-elevated active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Moment Baru
            </Link>
          )}
        </div>
      </div>

      {refreshError && !error && (
        <p role="status" className="mx-6 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{refreshError}</p>
      )}

      {loading ? (
        <div className="space-y-4 px-6 pt-5">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-rose-50" />)}
          </div>
          {[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : error ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : !hasCouple ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Hubungkan akunmu dengan pasangan dulu untuk mulai menyimpan moment.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Profil</Link>
        </div>
      ) : moments.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
            <Camera className="h-8 w-8 text-rose" />
          </div>
          <h2 className="text-lg font-bold text-ink">Belum ada moment</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Simpan foto, tempat, dan cerita dari setiap date. Nanti semuanya bisa jadi scrapbook kalian.
          </p>
          <Link
            href="/app/moments/baru"
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Simpan Moment Pertama
          </Link>
        </div>
      ) : (
        <div className="pt-5">
          {/* Entry points */}
          <div className="grid grid-cols-2 gap-3 px-6">
            <Link
              href="/app/moments/scrapbook"
              className="flex items-center gap-2.5 rounded-2xl border border-border bg-white p-3 shadow-card active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose/10">
                <BookHeart className="h-[18px] w-[18px] text-rose" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">Scrapbook</span>
                <span className="block text-[11px] leading-tight text-ink-muted">Cetak jadi album</span>
              </span>
            </Link>
            <Link
              href="/app/moments/peta"
              className="flex items-center gap-2.5 rounded-2xl border border-border bg-white p-3 shadow-card active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage/15">
                <MapIcon className="h-[18px] w-[18px] text-sage-dark" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">Peta</span>
                <span className="block text-[11px] leading-tight text-ink-muted">Jejak date kalian</span>
              </span>
            </Link>
          </div>

          {/* Search + filters */}
          <div className="mt-5 px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari judul, tempat, atau cerita"
                aria-label="Cari moment"
                className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-rose-50 text-ink-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter moment">
            <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={chipClass(filter === 'all')}>
              Semua
            </button>
            <button
              type="button"
              onClick={() => setFilter('favorite')}
              aria-pressed={filter === 'favorite'}
              className={cn(chipClass(filter === 'favorite'), 'flex items-center gap-1')}
            >
              <Star className={cn('h-3.5 w-3.5', filter === 'favorite' ? 'fill-white' : 'fill-gold text-gold')} />
              Favorit{favoriteCount > 0 ? ` · ${favoriteCount}` : ''}
            </button>
            {years.map((y) => (
              <button key={y} type="button" onClick={() => setFilter(y)} aria-pressed={filter === y} className={chipClass(filter === y)}>
                {y}
              </button>
            ))}
          </div>

          {actionError && <p className="mx-6 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center px-8 pt-12 text-center">
              {filter === 'favorite' && !query.trim() ? (
                <>
                  <Star className="h-8 w-8 text-gold" />
                  <p className="mt-3 text-sm font-semibold text-ink">Belum ada moment favorit</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
                    Ketuk bintang di moment yang paling berkesan buat kalian.
                  </p>
                </>
              ) : (
                <>
                  <SearchX className="h-8 w-8 text-ink-muted" />
                  <p className="mt-3 text-sm font-semibold text-ink">Tidak ada moment yang cocok</p>
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setFilter('all') }}
                    className="mt-3 text-xs font-semibold text-rose"
                  >
                    Tampilkan semua moment
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-7 px-6 pt-5">
              {filtering && (
                <p className="-mb-3 text-xs text-ink-muted">{visible.length} moment ditemukan</p>
              )}
              {groups.map((group) => (
                <section key={group.label}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{group.label}</p>
                  <div className="space-y-4">
                    {group.items.map((m) => {
                      const cover = m.photos[0]
                      return (
                        <div
                          key={m.id}
                          className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-card"
                        >
                          <Link href={`/app/moments/${m.id}`} className="block transition-transform active:scale-[0.99]">
                            <div className="relative aspect-[4/3] bg-rose-50">
                              {cover?.url ? (
                                <SignedPhoto src={cover.url} path={cover.storage_path} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center"><Camera className="h-8 w-8 text-rose/40" /></div>
                              )}
                              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white">
                                <Images className="h-3.5 w-3.5" /> {m.photos.length}
                              </span>
                            </div>
                            <div className="p-4">
                              <p className="font-bold text-ink">{m.title}</p>
                              <p className="mt-0.5 text-xs text-ink-muted">{formatDateID(m.moment_date)}</p>
                              {m.location_name && (
                                <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-light">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-rose" />
                                  <span className="truncate">{m.location_name}</span>
                                </p>
                              )}
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(m)}
                            aria-label={m.is_favorite ? `Hapus "${m.title}" dari favorit` : `Tandai "${m.title}" sebagai favorit`}
                            aria-pressed={m.is_favorite}
                            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90"
                          >
                            <Star className={cn('h-[18px] w-[18px]', m.is_favorite && 'fill-gold text-gold')} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
