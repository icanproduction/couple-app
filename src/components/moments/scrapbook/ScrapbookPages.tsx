'use client'

// The printable scrapbook: a cover page, then one page per moment with all
// of its photos. Two templates share the same data: Polaroid and Majalah.
import { createContext, forwardRef, useContext, type CSSProperties } from 'react'
import { MapPin } from 'lucide-react'
import { formatDateID, formatDateShortID } from '@/lib/dates'
import type { MomentPhoto } from '@/lib/moments'
import { coverPhoto, type ScrapbookMoment, type ScrapbookStyle } from '@/lib/scrapbook'
import { handFont, serifFont } from './fonts'
import { SCRAPBOOK_CSS } from './styles'

interface Props {
  style: ScrapbookStyle
  title: string
  names: string
  range: string
  moments: ScrapbookMoment[]
  /** storage_path → signed URL */
  urls: Record<string, string>
  /** A photo failed to load (e.g. its signed URL expired); called with its storage_path. */
  onPhotoError?: (path: string) => void
}

type Vars = CSSProperties & Record<`--${string}`, string | number>

const PhotoErrorContext = createContext<(path: string) => void>(() => undefined)

const ROTATIONS = [-2.2, 1.8, -1.2, 2.4, -1.8, 1.2, -2.6]

function descClass(text: string | null): string {
  const n = text?.length ?? 0
  return n > 900 ? 'sb-desc-l' : n > 350 ? 'sb-desc-m' : 'sb-desc-s'
}

function pageNo(n: number): string {
  return String(n).padStart(2, '0')
}

function Photo({ photo, urls, alt }: { photo: MomentPhoto; urls: Record<string, string>; alt: string }) {
  const onError = useContext(PhotoErrorContext)
  const url = urls[photo.storage_path]
  return url
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage; must load eagerly for print
    ? <img src={url} alt={alt} decoding="async" onError={() => onError(photo.storage_path)} />
    // eslint-disable-next-line @next/next/no-img-element -- 1px placeholder while the URL is missing
    : <img alt="" aria-hidden="true" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
}

function polaroidLayout(count: number, long: boolean): { cols: number; maxWidth: string; aspect: string } {
  if (count <= 1) return { cols: 1, maxWidth: long ? '56%' : '74%', aspect: '4 / 3' }
  if (count === 2) return { cols: 2, maxWidth: long ? '78%' : '100%', aspect: '1 / 1' }
  if (count === 3) return { cols: 3, maxWidth: '100%', aspect: '1 / 1' }
  if (count === 4) return long ? { cols: 4, maxWidth: '100%', aspect: '1 / 1' } : { cols: 2, maxWidth: '68%', aspect: '1 / 1' }
  if (count <= 6) return long ? { cols: 4, maxWidth: '100%', aspect: '1 / 1' } : { cols: 3, maxWidth: '90%', aspect: '1 / 1' }
  return { cols: 4, maxWidth: '100%', aspect: '1 / 1' }
}

function PolaroidPage({ m, n, urls }: { m: ScrapbookMoment; n: number; urls: Record<string, string> }) {
  const long = (m.description?.length ?? 0) > 900
  const layout = polaroidLayout(m.photos.length, long)
  return (
    <section className="sb-page sb-polaroid" aria-label={m.title}>
      <div className={`sb-inner ${descClass(m.description)}`}>
        <p className="pl-date">{formatDateID(m.moment_date)}</p>
        <h2 className="pl-title sb-hand">{m.title}</h2>
        {m.location_name && (
          <p className="pl-place"><MapPin aria-hidden="true" /> {m.location_name}</p>
        )}
        {m.photos.length > 0 && (
          <div className="pl-grid" style={{ maxWidth: layout.maxWidth }}>
            {m.photos.map((p, i) => (
              <figure
                key={p.id}
                className="pl-photo"
                style={{ '--cols': layout.cols, '--rot': `${ROTATIONS[i % ROTATIONS.length]}deg`, '--aspect': layout.aspect } as Vars}
              >
                {i === 0 && <span className="pl-tape" aria-hidden="true" />}
                <Photo photo={p} urls={urls} alt={`${m.title} — foto ${i + 1}`} />
                {i === 0 && <figcaption className="sb-hand">{formatDateShortID(m.moment_date)} {m.moment_date.slice(0, 4)}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        {m.description && <p className="pl-desc">{m.description}</p>}
        <div className="pl-foot">
          <span className="sb-hand">Nanti Kita</span>
          <span>{pageNo(n)}</span>
        </div>
      </div>
    </section>
  )
}

function magazineLayout(count: number, long: boolean) {
  if (count === 2) return { hero: null, cols: 2, aspect: long ? '1 / 1' : '4 / 5' }
  const hero = count === 1 ? (long ? '16 / 9' : '4 / 3') : count >= 5 || long ? '2 / 1' : '16 / 9'
  const rest = Math.max(0, count - 1)
  const cols = rest <= 4 ? Math.max(rest, 1) : rest === 5 ? 5 : 3
  return { hero, cols, aspect: rest === 6 ? '3 / 2' : '1 / 1' }
}

function MagazinePage({ m, n, total, urls }: { m: ScrapbookMoment; n: number; total: number; urls: Record<string, string> }) {
  const long = (m.description?.length ?? 0) > 900
  const layout = magazineLayout(m.photos.length, long)
  const [first, ...rest] = m.photos
  const gridPhotos = layout.hero ? rest : m.photos
  const kicker = [formatDateID(m.moment_date), m.location_name].filter(Boolean).join('  ·  ')
  return (
    <section className="sb-page sb-majalah" aria-label={m.title}>
      <div className={`sb-inner ${descClass(m.description)}`}>
        <div className="mj-top">
          <span className="sb-serif">Nanti Kita</span>
          <span>Cerita {n - 1} dari {total}</span>
        </div>
        <p className="mj-kicker">{kicker}</p>
        <h2 className="mj-title sb-serif">{m.title}</h2>
        <div className="mj-rule" />
        {layout.hero && first && (
          <div className="mj-hero" style={{ '--aspect': layout.hero } as Vars}>
            <Photo photo={first} urls={urls} alt={`${m.title} — foto 1`} />
          </div>
        )}
        {gridPhotos.length > 0 && (
          <div className="mj-grid" style={{ '--cols': layout.cols, '--aspect': layout.aspect } as Vars}>
            {gridPhotos.map((p, i) => (
              <Photo key={p.id} photo={p} urls={urls} alt={`${m.title} — foto ${i + (layout.hero ? 2 : 1)}`} />
            ))}
          </div>
        )}
        {m.description && (
          <p className={`mj-desc ${m.description.length > 350 ? 'mj-desc-cols' : ''}`}>{m.description}</p>
        )}
        <div className="mj-spacer" />
        <div className="mj-foot">
          <span>{formatDateID(m.moment_date)}</span>
          <span>{pageNo(n)}</span>
        </div>
      </div>
    </section>
  )
}

/** Up to three cover photos for the collage: favourites first, then spread across the range. */
function collagePhotos(moments: ScrapbookMoment[]): MomentPhoto[] {
  const withPhotos = moments.filter((m) => m.photos.length > 0)
  const favorites = withPhotos.filter((m) => m.is_favorite)
  const others = withPhotos.filter((m) => !m.is_favorite)
  const step = Math.max(1, Math.floor(others.length / 3))
  const spread = others.filter((_, i) => i % step === 0)
  return [...favorites, ...spread].slice(0, 3).map((m) => m.photos[0])
}

const COLLAGE_SPOTS: Record<number, { left: number; top: number; rot: number }[]> = {
  1: [{ left: 21, top: 2, rot: -3 }],
  2: [{ left: 6, top: 3, rot: -6 }, { left: 36, top: 7, rot: 5 }],
  3: [{ left: 1, top: 8, rot: -7 }, { left: 21, top: 0, rot: 2 }, { left: 41, top: 10, rot: 7 }],
}

function PolaroidCover({ title, names, range, moments, urls, photoCount }: Props & { photoCount: number }) {
  const photos = collagePhotos(moments)
  const spots = COLLAGE_SPOTS[photos.length] ?? []
  return (
    <section className="sb-page sb-polaroid" aria-label="Sampul">
      <div className="sb-inner">
        <div className="pc-wrap">
          <p className="pc-eyebrow">Scrapbook</p>
          <h1 className="pc-title sb-hand">{title}</h1>
          {names && <p className="pc-names">{names}</p>}
          {photos.length > 0 && (
            <div className="pc-collage">
              {photos.map((p, i) => (
                <figure
                  key={p.id}
                  className="pl-photo"
                  style={{
                    left: `${spots[i].left}cqw`, top: `${spots[i].top}cqw`, zIndex: i === 1 ? 2 : 1,
                    '--cols': 1, '--rot': `${spots[i].rot}deg`, '--aspect': '1 / 1',
                  } as Vars}
                >
                  {i === photos.length - 1 && <span className="pl-tape" aria-hidden="true" />}
                  <Photo photo={p} urls={urls} alt="" />
                </figure>
              ))}
            </div>
          )}
          <p className="pc-range">{range}</p>
          <p className="pc-stats">{moments.length} date · {photoCount} foto</p>
        </div>
      </div>
    </section>
  )
}

function MagazineCover({ title, names, range, moments, urls, photoCount }: Props & { photoCount: number }) {
  const onError = useContext(PhotoErrorContext)
  const hero = coverPhoto(moments)
  const heroUrl = hero ? urls[hero.storage_path] : undefined
  return (
    <section className="sb-page sb-majalah" aria-label="Sampul">
      <div className="mc">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
        {hero && heroUrl && <img className="mc-bg" src={heroUrl} alt="" decoding="async" onError={() => onError(hero.storage_path)} />}
        <div className="mc-shade" />
        <div className="mc-content">
          <p className="mc-mast sb-serif">Nanti Kita</p>
          <div className="mc-issue">
            <span>Edisi {range}</span>
            <span>Scrapbook</span>
          </div>
          <div className="mc-bottom">
            <p className="mc-kicker">Edisi Spesial</p>
            <h1 className="mc-title sb-serif">{title}</h1>
            {names && <p className="mc-names">{names}</p>}
            <div className="mc-stats">
              <div className="mc-stat"><b className="sb-serif">{moments.length}</b><span>date</span></div>
              <div className="mc-stat"><b className="sb-serif">{photoCount}</b><span>foto</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const ScrapbookPages = forwardRef<HTMLDivElement, Props>(function ScrapbookPages(props, ref) {
  const { style, moments, urls, onPhotoError } = props
  const photoCount = moments.reduce((sum, m) => sum + m.photos.length, 0)
  return (
    <PhotoErrorContext.Provider value={onPhotoError ?? noop}>
      <style>{SCRAPBOOK_CSS}</style>
      <div ref={ref} className={`sb-root ${handFont.variable} ${serifFont.variable}`}>
        {style === 'polaroid' ? (
          <PolaroidCover {...props} photoCount={photoCount} />
        ) : (
          <MagazineCover {...props} photoCount={photoCount} />
        )}
        {moments.map((m, i) =>
          style === 'polaroid'
            ? <PolaroidPage key={m.id} m={m} n={i + 2} urls={urls} />
            : <MagazinePage key={m.id} m={m} n={i + 2} total={moments.length} urls={urls} />
        )}
      </div>
    </PhotoErrorContext.Provider>
  )
})

function noop() {}

export default ScrapbookPages
