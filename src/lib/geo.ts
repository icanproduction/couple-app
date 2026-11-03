// Device location + place names for Moments.

export interface Coords {
  latitude: number
  longitude: number
}

/** Current device position. Rejects with a user-facing English message. */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device doesn\'t support GPS.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location access was denied. Allow location for this app in your browser settings.',
          2: 'Couldn\'t find your location. Try again outdoors or near a window.',
          3: 'GPS took too long to respond. Try again.',
        }
        reject(new Error(messages[err.code] ?? 'Couldn\'t get your location.'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

/**
 * Best-effort place name for coordinates via OpenStreetMap Nominatim
 * (free, no key; called only on user action, ≤1 request per moment).
 * Returns null on any failure — the user can always type the name.
 */
export async function reverseGeocode({ latitude, longitude }: Coords): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      zoom: '17',
      'accept-language': 'id',
    }).toString()
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const a = data?.address ?? {}
    const place = data?.name || a.amenity || a.tourism || a.leisure || a.shop || a.building || a.road
    const area = a.suburb || a.village || a.city_district || a.town || a.city || a.county
    const label = [place, area].filter(Boolean).join(', ')
    return label ? label.slice(0, 200) : null
  } catch {
    return null
  }
}

export function formatCoords({ latitude, longitude }: Coords): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

export function googleMapsUrl({ latitude, longitude }: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

/** OpenStreetMap embed (no API key) centered on the point with a marker */
export function osmEmbedUrl({ latitude, longitude }: Coords): string {
  const dLat = 0.004
  const dLon = 0.006
  const bbox = [longitude - dLon, latitude - dLat, longitude + dLon, latitude + dLat].join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`
}
