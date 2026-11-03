// Reads the capture date and GPS position from a photo's EXIF so a Moment can
// be pre-filled from the first photo. Kept free of '@/' imports so
// scripts/verify/exif.mjs can import it directly under Node.
import exifr from 'exifr'

export interface PhotoMeta {
  /** Capture day as YYYY-MM-DD in the camera's local time */
  date: string | null
  /** Capture instant (ISO); EXIF without a UTC offset is read as WIB */
  takenAt: string | null
  latitude: number | null
  longitude: number | null
}

const EMPTY: PhotoMeta = { date: null, takenAt: null, latitude: null, longitude: null }
const EXIF_DATETIME = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/
const WIB_OFFSET = '+07:00'

type PhotoInput = Blob | ArrayBuffer | Uint8Array

function parseExifDate(raw: unknown, offset: unknown): Pick<PhotoMeta, 'date' | 'takenAt'> {
  const m = typeof raw === 'string' ? raw.match(EXIF_DATETIME) : null
  if (!m) return { date: null, takenAt: null }
  const [, y, mo, d, h, mi, s] = m
  // Cameras reset to 0000:00:00 or 1970 when the clock was never set.
  if (Number(y) < 1990 || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) {
    return { date: null, takenAt: null }
  }
  const tz = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : WIB_OFFSET
  const instant = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`)
  return {
    date: `${y}-${mo}-${d}`,
    takenAt: Number.isNaN(instant.getTime()) ? null : instant.toISOString(),
  }
}

function validCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    // 0,0 is what many apps write when the fix was missing.
    !(lat === 0 && lng === 0)
  )
}

/** Never throws: a photo without EXIF (screenshots, WhatsApp images) yields nulls. */
export async function readPhotoMeta(input: PhotoInput): Promise<PhotoMeta> {
  try {
    const [tags, gps] = await Promise.all([
      exifr.parse(input, {
        pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal'],
        reviveValues: false,
      }).catch(() => null),
      exifr.gps(input).catch(() => null),
    ])
    const { date, takenAt } = parseExifDate(
      tags?.DateTimeOriginal ?? tags?.CreateDate,
      tags?.OffsetTimeOriginal,
    )
    const lat = gps?.latitude
    const lng = gps?.longitude
    const hasGps = validCoords(lat, lng)
    return {
      date,
      takenAt,
      latitude: hasGps ? lat : null,
      longitude: hasGps ? (lng as number) : null,
    }
  } catch {
    return EMPTY
  }
}
