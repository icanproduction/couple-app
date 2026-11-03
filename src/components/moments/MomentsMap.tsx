'use client'

// Leaflet map of every moment with GPS (F12). Leaflet touches `window`, so it
// is imported inside an effect and never runs on the server. Markers are
// divIcons (no default marker images needed); popups are built from DOM nodes
// with textContent so user-written titles can't inject HTML.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDateID } from '@/lib/dates'
import { resignPhotoPath, type MomentWithPhotos } from '@/lib/moments'

export type MappedMoment = MomentWithPhotos & { latitude: number; longitude: number }

export interface MomentsMapHandle {
  focus: (momentId: string) => void
}

interface Props {
  moments: MappedMoment[]
  className?: string
}

const PIN_STYLE = `
.nk-pin { position: relative; width: 44px; height: 52px; }
.nk-pin__bubble { position: absolute; left: 0; top: 0; width: 44px; height: 44px; border-radius: 9999px;
  background: #F06B6B; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(45,36,36,.28); overflow: hidden;
  display: flex; align-items: center; justify-content: center; color: #fff; font: 700 15px/1 'DM Sans', system-ui, sans-serif; }
.nk-pin__bubble img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nk-pin__tail { position: absolute; left: 50%; bottom: 0; width: 12px; height: 12px; margin-left: -6px;
  background: #F06B6B; transform: rotate(45deg); border-right: 3px solid #fff; border-bottom: 3px solid #fff; }
.nk-pin--fav .nk-pin__bubble, .nk-pin--fav .nk-pin__tail { background: #E8C078; }
.nk-popup { width: 200px; font-family: 'DM Sans', system-ui, sans-serif; }
.nk-popup img { width: 100%; height: 112px; object-fit: cover; border-radius: 10px; display: block; background: #FFF1F1; }
.nk-popup__title { margin: 8px 0 0; font-size: 14px; font-weight: 700; color: #2D2424; line-height: 1.3; }
.nk-popup__meta { margin: 2px 0 0; font-size: 12px; color: #9B8F8F; }
.nk-popup__link { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; color: #F06B6B !important; text-decoration: none; }
.leaflet-popup-content-wrapper { border-radius: 16px; }
.leaflet-popup-content { margin: 10px; }
`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Photo <img> that asks once for a fresh signed URL if the one it has expired. */
function photoImg(url: string, path: string, alt: string): HTMLImageElement {
  const img = el('img')
  img.alt = alt
  img.addEventListener('error', () => {
    resignPhotoPath(path).then((fresh) => { if (fresh) img.src = fresh }).catch(() => undefined)
  }, { once: true })
  img.src = url
  return img
}

interface Pin {
  marker: Marker
  iconKey: string
  popupKey: string
}

const MomentsMap = forwardRef<MomentsMapHandle, Props>(function MomentsMap({ moments, className }, ref) {
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const zooming = useRef(false)
  const pins = useRef<Map<string, Pin>>(new Map())
  const fittedKey = useRef<string | null>(null)
  const routerRef = useRef(router)
  routerRef.current = router

  useImperativeHandle(ref, () => ({
    focus(momentId: string) {
      const map = mapRef.current
      const marker = pins.current.get(momentId)?.marker
      if (!map || !marker) return
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 })
      marker.openPopup()
      container.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
  }), [])

  // Key that changes only when the set of pins (or anything they show) changes,
  // including a re-signed cover URL.
  const pinsKey = JSON.stringify(moments.map((m) => [
    m.id, m.latitude, m.longitude, m.is_favorite, m.title, m.moment_date, m.location_name,
    m.photos[0]?.storage_path ?? null, m.photos[0]?.url ?? null,
  ]))

  useEffect(() => {
    let cancelled = false
    const pinMap = pins.current

    ;(async () => {
      // Leaflet is CommonJS: the bundler may expose it as `default` or as the namespace.
      const mod = await import('leaflet')
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod
      if (cancelled || !container.current) return

      if (!mapRef.current) {
        const created = L.map(container.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        created.on('zoomanim', () => { zooming.current = true })
        created.on('zoomend', () => { zooming.current = false })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(created)
        mapRef.current = created
      }
      const map = mapRef.current

      const makeIcon = (m: MappedMoment) => {
        const cover = m.photos[0]
        const pin = el('div', `nk-pin${m.is_favorite ? ' nk-pin--fav' : ''}`)
        const bubble = el('div', 'nk-pin__bubble')
        if (cover?.url) bubble.appendChild(photoImg(cover.url, cover.storage_path, ''))
        else bubble.textContent = m.title.trim().slice(0, 1).toUpperCase() || '•'
        pin.append(bubble, el('div', 'nk-pin__tail'))
        return L.divIcon({ html: pin, className: '', iconSize: [44, 52], iconAnchor: [22, 52], popupAnchor: [0, -50] })
      }

      const makePopup = (m: MappedMoment) => {
        const cover = m.photos[0]
        const popup = el('div', 'nk-popup')
        if (cover?.url) popup.appendChild(photoImg(cover.url, cover.storage_path, m.title))
        popup.appendChild(el('p', 'nk-popup__title', m.title))
        popup.appendChild(el('p', 'nk-popup__meta', [formatDateID(m.moment_date), m.location_name].filter(Boolean).join(' · ')))
        const link = el('a', 'nk-popup__link', 'Buka moment →')
        link.href = `/app/moments/${m.id}`
        link.addEventListener('click', (e) => {
          e.preventDefault()
          routerRef.current.push(`/app/moments/${m.id}`)
        })
        popup.appendChild(link)
        return popup
      }

      // Update pins in place (by moment id) so a live change elsewhere doesn't
      // close the popup the user has open.
      const seen = new Set<string>()
      for (const m of moments) {
        seen.add(m.id)
        const coverUrl = m.photos[0]?.url ?? null
        const iconKey = JSON.stringify([m.is_favorite, m.title, coverUrl])
        const popupKey = JSON.stringify([m.title, m.moment_date, m.location_name, coverUrl])
        const existing = pinMap.get(m.id)
        if (!existing) {
          const marker = L.marker([m.latitude, m.longitude], { icon: makeIcon(m), title: m.title, alt: m.title, riseOnHover: true })
          marker.bindPopup(makePopup(m), { closeButton: true, maxWidth: 240, minWidth: 200 })
          marker.addTo(map)
          pinMap.set(m.id, { marker, iconKey, popupKey })
          continue
        }
        const { marker } = existing
        const at = marker.getLatLng()
        if (at.lat !== m.latitude || at.lng !== m.longitude) marker.setLatLng([m.latitude, m.longitude])
        if (existing.iconKey !== iconKey) {
          marker.options.title = m.title
          marker.options.alt = m.title
          marker.setIcon(makeIcon(m))
          existing.iconKey = iconKey
        }
        if (existing.popupKey !== popupKey) {
          marker.setPopupContent(makePopup(m))
          existing.popupKey = popupKey
        }
      }
      for (const [id, pin] of Array.from(pinMap)) {
        if (seen.has(id)) continue
        pin.marker.remove()
        pinMap.delete(id)
      }

      // Re-fit only when pins are added/moved/removed, not when one is just
      // re-styled (e.g. a live favourite), so the user's pan/zoom survives.
      const positionsKey = moments.map((m) => `${m.id}:${m.latitude}:${m.longitude}`).join('|')
      if (positionsKey !== fittedKey.current) {
        fittedKey.current = positionsKey
        if (moments.length === 1) {
          map.setView([moments[0].latitude, moments[0].longitude], 15)
        } else if (moments.length > 1) {
          const bounds = L.latLngBounds(moments.map((m) => [m.latitude, m.longitude] as [number, number]))
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 })
        } else {
          map.setView([-2.5, 118], 4) // Indonesia
        }
      }
      // The container may have been laid out after the map was created.
      setTimeout(() => { if (!cancelled && mapRef.current === map) map.invalidateSize() }, 50)
    })().catch(() => undefined)

    return () => { cancelled = true }
    // pinsKey captures every field of `moments` the markers use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey])

  useEffect(() => {
    const pinMap = pins.current
    return () => {
      const map = mapRef.current
      mapRef.current = null
      pinMap.clear()
      if (!map) return
      const teardown = () => {
        try {
          map.off()
          map.remove() // also cancels a running flyTo
        } catch {
          // already torn down
        }
      }
      // A CSS zoom animation ends on a 250 ms timer that reads the map's
      // panes; removing the map before it fires throws. Let it finish first.
      if (zooming.current) setTimeout(teardown, 300)
      else teardown()
    }
  }, [])

  return (
    <>
      <style>{PIN_STYLE}</style>
      {/* `isolate` keeps Leaflet's high z-index panes below the fixed bottom nav. */}
      <div ref={container} className={`isolate ${className ?? ''}`} role="region" aria-label="Peta moment kalian" />
    </>
  )
})

export default MomentsMap
