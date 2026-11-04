'use client'

// Pet Kita main screen (spec §5.2). Nothing decays: the pet grows from what
// the couple does in the app plus one hi each a day. The first gesture of the
// day is the hi (+5, both of you +5 more); later taps only animate. Partner
// activity arrives in realtime. Presence is only ever shown when it's there.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, BellRing, BookOpen, ChevronRight, Cookie, Ellipsis, Hand, Library, Pencil, Sprout,
  Volleyball, WifiOff,
} from 'lucide-react'
import { todayJakarta } from '@/lib/dates'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { stageForLevel, type Gesture, type PetStatus, type PetWarmthEvent } from '@/types/pet'
import PetStyles from '@/components/pet/PetStyles'
import PetRoomScene from '@/components/pet/PetRoomScene'
import PetGrowSheet from '@/components/pet/PetGrowSheet'
import PetRenameSheet from '@/components/pet/PetRenameSheet'
import {
  EMPTY_ROOM, PetError, fetchEverSaidHi, fetchRoomData, fetchSinceVisit, fetchStatus, fetchTodayNote,
  isOffline, markVisit, sayHi, type RoomData, type ShownNote,
} from '@/components/pet/api'
import {
  GESTURE_LABEL, captionFor, celebrationCopy, eventHref, eventLine, firstName, initialOf, introCopy,
  jakartaHour, nextUnlockLabel, poseFor, presenceLines, skyFor, stateLine, type HatchInfo,
} from '@/components/pet/copy'
import PetCelebration from './PetCelebration'
import PetNotesSheet from './PetNotesSheet'
import PetShelfSheet from './PetShelfSheet'

interface Props {
  initialStatus: PetStatus
  userId: string
  coupleId: string
  /** profile_id → name, both members. */
  names: Record<string, string>
  partnerId: string | null
  partnerGender: string | null
  /** The couple space is closed: the pet rests, taps only animate. */
  closed: boolean
}

type Overlay =
  | { kind: 'intro' }
  | { kind: 'home' }
  | { kind: 'level'; from: number; to: number }

interface Float { id: number; text: string }

const GESTURE_ICON = { pat: Hand, snack: Cookie, play: Volleyball } as const
const GESTURES: Gesture[] = ['pat', 'snack', 'play']
const HEARTS = [[-70, -50], [-40, -78], [0, -92], [40, -78], [70, -50], [-56, -14], [56, -14]] as const

export default function PetHome({ initialStatus, userId, coupleId, names, partnerId, partnerGender, closed }: Props) {
  const [status, setStatus] = useState<PetStatus>(initialStatus)
  const statusRef = useRef(status)
  statusRef.current = status

  const [note, setNote] = useState<ShownNote | null | 'loading'>('loading')
  const [noteVersion, setNoteVersion] = useState(0)
  const [since, setSince] = useState<PetWarmthEvent[] | null>(null)
  const [sinceError, setSinceError] = useState(false)
  const [firstVisit, setFirstVisit] = useState(false)
  const [freshIds, setFreshIds] = useState<string[]>([])
  const [room, setRoom] = useState<RoomData>(EMPTY_ROOM)
  const [hatch, setHatch] = useState<HatchInfo | null>(null)
  const [gesture, setGesture] = useState<{ g: Gesture; key: number } | null>(null)
  const [floats, setFloats] = useState<Float[]>([])
  const [burst, setBurst] = useState(0)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [freshLevels, setFreshLevels] = useState<number[]>([])
  const [sheet, setSheet] = useState<'shelf' | 'notes' | 'grow' | 'rename' | null>(null)
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(true)
  const [hour, setHour] = useState<number | null>(null)

  const visitStarted = useRef<string>(new Date().toISOString())
  const sinceFrom = useRef<string | null>(null)
  const sinceReady = useRef(false)
  const sinceLoaded = useRef(false)
  const visitDone = useRef(false)
  const hiInFlight = useRef(false)
  const pendingHi = useRef<Gesture | null>(null)
  const lastRoomLoad = useRef(0)
  const knownEvents = useRef<Set<string>>(new Set())
  const floatId = useRef(0)
  const notePolls = useRef(0)
  const noteInFlight = useRef(false)
  const noteLoadedAt = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const petId = status.pet_id
  const pet = status.name
  const solo = !partnerId
  const partner = partnerId ? firstName(names[partnerId]) : null
  const initials = solo ? initialOf(names[userId]) : `${initialOf(names[userId])}${initialOf(names[partnerId ?? ''])}`

  const addFloat = useCallback((text: string) => {
    const id = ++floatId.current
    setFloats((f) => [...f.slice(-2), { id, text }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1700)
  }, [])

  const play = useCallback((g: Gesture) => setGesture((cur) => ({ g, key: (cur?.key ?? 0) + 1 })), [])

  // ---- loaders -------------------------------------------------------------

  const loadSince = useCallback(async () => {
    // Waits for the visit: "since" starts at the visit before this one.
    if (!sinceReady.current) return
    try {
      const rows = await fetchSinceVisit(petId, sinceFrom.current)
      // My own taps during this visit are already in the presence row.
      const shown = rows.filter((e) => !(e.actor_id === userId && e.created_at >= visitStarted.current))
      const fresh = sinceLoaded.current ? shown.filter((e) => !knownEvents.current.has(e.id)).map((e) => e.id) : []
      shown.forEach((e) => knownEvents.current.add(e.id))
      sinceLoaded.current = true
      setSince(shown)
      setSinceError(false)
      if (fresh.length) setFreshIds(fresh)
    } catch {
      setSinceError(true)
      setSince((s) => s ?? [])
    }
  }, [petId, userId])

  const loadRoom = useCallback(async (level: number) => {
    lastRoomLoad.current = Date.now()
    try { setRoom(await fetchRoomData(coupleId, petId, level)) } catch { /* items show without live values */ }
  }, [coupleId, petId])

  const loadNote = useCallback(async () => {
    // One request at a time: the realtime hook fires once on subscribe too.
    if (noteInFlight.current) return
    noteInFlight.current = true
    let next: ShownNote | null = null
    try { next = await fetchTodayNote(petId) } catch { next = null } finally { noteInFlight.current = false; noteLoadedAt.current = Date.now() }
    // Keep a shown note if a refresh fails; a stand-in note asks again shortly.
    setNote((cur) => next ?? (cur === 'loading' ? null : cur))
    if (next?.pending && notePolls.current < 3) {
      notePolls.current += 1
      setTimeout(() => { void loadNoteRef.current() }, 4000)
    }
  }, [petId])
  const loadNoteRef = useRef(loadNote)
  loadNoteRef.current = loadNote

  const loadHatch = useCallback(async () => {
    try { setHatch({ everSaidHi: await fetchEverSaidHi(petId) }) } catch { setHatch({ everSaidHi: [] }) }
  }, [petId])

  /** Compares the new status with what's on screen and plays what changed. */
  const applyStatus = useCallback((next: PetStatus) => {
    const prev = statusRef.current
    statusRef.current = next
    setStatus(next)

    const before = new Set(prev.said_hi_today.map((h) => h.profile_id))
    const theirs = next.said_hi_today.filter((h) => h.profile_id !== userId && !before.has(h.profile_id))
    if (theirs.length && prev.day === next.day) {
      const hi = theirs[0]
      play(hi.gesture ?? 'pat')
      addFloat(`${firstName(names[hi.profile_id])} said hi`)
      if (next.both_today && !prev.both_today) setBurst((b) => b + 1)
    }
    if (!prev.hatched && next.hatched) {
      setOverlay((o) => o ?? { kind: 'home' })
      if (next.said_hi_today.length < 2) void loadHatch()
    } else if (next.level > prev.level) {
      setOverlay((o) => (o && o.kind === 'level' ? { ...o, to: next.level } : o ?? { kind: 'level', from: prev.level, to: next.level }))
      void markVisit({ petId: next.pet_id, celebratedLevel: next.level }).catch(() => undefined)
    }
    if (next.level !== prev.level) void loadRoom(next.level)
    if (!next.hatched && next.said_hi_today.length !== prev.said_hi_today.length) void loadHatch()
  }, [userId, names, play, addFloat, loadHatch, loadRoom])

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStatus()
      if (next && next.pet_id === petId) applyStatus(next)
    } catch { /* keep what's on screen; the next event or visit retries */ }
    void loadSince()
    if (Date.now() - lastRoomLoad.current > 60_000) void loadRoom(statusRef.current.level)
  }, [petId, applyStatus, loadSince, loadRoom])

  // ---- first load: the visit decides the one overlay -----------------------

  useEffect(() => {
    if (visitDone.current) return
    visitDone.current = true
    const s = statusRef.current
    void loadRoom(s.level)
    void loadNote()
    if (!s.hatched) void loadHatch()
    ;(async () => {
      try {
        const visit = await markVisit({ petId: s.pet_id })
        if (!visit) throw new Error('no visit')
        sinceFrom.current = visit.previous_seen_at
        setFirstVisit(!visit.previous_seen_at)
        const now = statusRef.current
        if (now.migrated && !visit.intro_seen_at) {
          setOverlay({ kind: 'intro' })
          void markVisit({ petId: now.pet_id, introSeen: true }).catch(() => undefined)
        } else if (
          !now.migrated && now.hatched && now.hatched_at && visit.previous_seen_at &&
          Date.parse(now.hatched_at) > Date.parse(visit.previous_seen_at)
        ) {
          setOverlay({ kind: 'home' })
          if (now.level > visit.celebrated_level) void markVisit({ petId: now.pet_id, celebratedLevel: now.level }).catch(() => undefined)
        } else if (now.level > visit.celebrated_level) {
          setOverlay({ kind: 'level', from: visit.celebrated_level, to: now.level })
          void markVisit({ petId: now.pet_id, celebratedLevel: now.level }).catch(() => undefined)
        }
      } catch {
        sinceFrom.current = new Date(Date.now() - 86_400_000).toISOString()
      }
      sinceReady.current = true
      void loadSince()
    })()
  }, [loadRoom, loadNote, loadHatch, loadSince])

  useCoupleRealtime(coupleId, ['couple_pets', 'pet_warmth_events'], () => { void refresh() })
  // The hook also fires once on subscribe, right after the first load: skip that one.
  useCoupleRealtime(coupleId, ['pet_daily_notes'], () => {
    if (Date.now() - noteLoadedAt.current < 3000) return
    void loadNote()
    setNoteVersion((v) => v + 1)
  })

  // Night, the sky and "today" move on while the screen stays open.
  useEffect(() => {
    setHour(jakartaHour())
    const t = setInterval(() => {
      setHour(jakartaHour())
      if (document.visibilityState === 'visible') void refresh()
    }, 5 * 60_000)
    return () => clearInterval(t)
  }, [refresh])

  // ---- saying hi -------------------------------------------------------------

  const send = useCallback(async (g: Gesture) => {
    hiInFlight.current = true
    try {
      const r = await sayHi(g)
      if (r.counted) {
        if (r.both_today) {
          addFloat(r.points >= 10 ? '+5 +5, both of you today' : r.points > 0 ? `+${r.points}, both of you today` : 'Both of you today')
          setBurst((b) => b + 1)
        } else {
          addFloat(r.points > 0 ? `+${r.points}` : 'You said hi')
        }
        // Show my hi at once; the refresh below brings the real row.
        const s = statusRef.current
        const mine = { profile_id: userId, gesture: g, at: new Date().toISOString() }
        const optimistic: PetStatus = {
          ...s,
          said_hi_today: [...s.said_hi_today.filter((h) => h.profile_id !== userId), mine],
          both_today: r.both_today,
          day: s.day || todayJakarta(),
        }
        statusRef.current = optimistic
        setStatus(optimistic)
      }
      const next = await fetchStatus().catch(() => null)
      if (next && next.pet_id === petId) applyStatus(next)
    } catch (e) {
      if (e instanceof PetError && e.kind === 'offline') {
        pendingHi.current = g
        setNotice("You're offline. Your hi goes through once you're back.")
      } else {
        setNotice(e instanceof PetError ? e.message : "Couldn't say hi just now. Try again.")
      }
    } finally {
      hiInFlight.current = false
    }
  }, [userId, petId, addFloat, applyStatus])

  const gestureTap = useCallback((g: Gesture) => {
    play(g)
    if (closed) return
    const s = statusRef.current
    const saidHi = s.day === todayJakarta() && s.said_hi_today.some((h) => h.profile_id === userId)
    if (saidHi || hiInFlight.current) return
    if (isOffline()) {
      pendingHi.current = g
      setNotice("You're offline. Your hi goes through once you're back.")
      return
    }
    void send(g)
  }, [closed, userId, play, send])

  useEffect(() => {
    const update = () => {
      const on = !isOffline()
      setOnline(on)
      if (on) {
        setNotice((n) => (n.startsWith("You're offline") ? '' : n))
        const g = pendingHi.current
        pendingHi.current = null
        if (g && !hiInFlight.current) void send(g)
        void refresh()
      }
    }
    setOnline(!isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [send, refresh])

  useEffect(() => {
    if (!notice || notice.startsWith("You're offline")) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [menu])

  // ---- derived ---------------------------------------------------------------

  const pose = poseFor(status, hatch)
  const sky = skyFor(hour, status.night)
  const caption = closed
    ? { text: `This couple space is closed, so ${pet} is resting here.` }
    : captionFor(status, hatch, { me: userId, partnerId, partnerName: partnerId ? names[partnerId] : null, partnerGender })
  // Before the pet is home, the arrival caption already says who said hi.
  const presence = status.hatched ? presenceLines(status, userId, names) : []
  const saidHiToday = status.said_hi_today.some((h) => h.profile_id === userId)
  const heavy = new Set(status.comfort_for)
  const lean = heavy.has(userId) && partnerId && heavy.has(partnerId) ? null
    : partnerId && heavy.has(partnerId) ? 'right' : heavy.has(userId) ? 'left' : null
  const showProgress = status.hatched && status.mood !== 'dozy'
  const pct = Math.round((status.into_level / Math.max(1, status.xp_per_level)) * 100)

  function closeOverlay(openShelf: boolean) {
    if (overlay?.kind === 'level') {
      const lv: number[] = []
      for (let i = overlay.from + 1; i <= overlay.to; i++) lv.push(i)
      setFreshLevels(lv)
    }
    setOverlay(null)
    if (openShelf) setSheet('shelf')
  }

  const celebration = overlay?.kind === 'level'
    ? celebrationCopy(pet, overlay.from, overlay.to, stageForLevel(overlay.from), stageForLevel(overlay.to))
    : null

  return (
    <div className="animate-fade-in pb-6">
      <PetStyles />

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-border bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link href="/app/home" aria-label="Back to Home" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted active:bg-rose-50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight text-ink">{pet}</h1>
            <p className="truncate text-xs text-ink-muted" data-testid="pet-state">{stateLine(status)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-1 text-xs font-bold text-yellow-700">Lv {status.level}</span>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-label="More"
              aria-expanded={menu}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted active:bg-rose-50"
            >
              <Ellipsis className="h-5 w-5" />
            </button>
            {menu && (
              <div className="pa-pop-in absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-2xl border border-border bg-white py-1 shadow-elevated" role="menu">
                <button type="button" role="menuitem" disabled={closed} onClick={() => { setMenu(false); setSheet('rename') }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink disabled:opacity-40">
                  <Pencil className="h-4 w-4 text-ink-muted" /> Rename
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setSheet('grow') }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink">
                  <Sprout className="h-4 w-4 text-ink-muted" /> <span className="truncate">How {pet} grows</span>
                </button>
                <Link href="/app/profile/notifikasi" role="menuitem" onClick={() => setMenu(false)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink">
                  <BellRing className="h-4 w-4 text-ink-muted" /> Notifications
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {!online && (
          <p className="flex items-center gap-2 rounded-2xl bg-ink/5 px-3 py-2 text-xs text-ink-light" role="status">
            <WifiOff className="h-4 w-4 shrink-0" /> You&apos;re offline. {pet} is still here, and taps still work.
          </p>
        )}

        {/* Today's note */}
        {note === 'loading' ? (
          <div className="rounded-3xl border border-border bg-white px-4 py-3.5 shadow-card" aria-busy="true">
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-rose-50" />
            <div className="mt-2 h-3.5 w-2/3 animate-pulse rounded bg-rose-50" />
          </div>
        ) : note ? (
          <figure className="relative rounded-3xl border border-border bg-white px-4 pb-2.5 pt-3.5 shadow-card" data-testid="pet-note">
            {note.kind === 'weekly' && note.title && <p className="mb-0.5 text-sm font-bold text-ink">{note.title}</p>}
            <blockquote className="break-words text-[15px] leading-relaxed text-ink">&ldquo;{note.line}&rdquo;</blockquote>
            <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
              <button type="button" onClick={() => setSheet('notes')} className="font-semibold text-rose">All notes</button>
              <span>{note.kind === 'weekly' ? 'This week' : "Today's note"}</span>
            </figcaption>
            <span aria-hidden className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-border bg-white" />
          </figure>
        ) : null}

        {/* The room */}
        <PetRoomScene
          status={status}
          pose={pose}
          room={room}
          sky={sky}
          initials={initials}
          solo={solo}
          lean={lean}
          gesture={gesture?.g ?? null}
          gestureKey={gesture?.key ?? 0}
          onPetTap={() => gestureTap('pat')}
        >
          {floats.map((f) => (
            <span key={f.id} className="pa-float-up pointer-events-none absolute left-1/2 top-[14%] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-rose shadow-card" aria-live="polite">
              {f.text}
            </span>
          ))}
          {burst > 0 && (
            <span key={burst} aria-hidden className="pointer-events-none absolute left-1/2 top-[52%] z-10">
              {HEARTS.map(([dx, dy], i) => (
                <svg key={i} viewBox="0 0 24 24" className="pa-heart absolute -ml-2.5 -mt-2.5 h-5 w-5 text-rose" fill="currentColor"
                  style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ))}
            </span>
          )}
          {overlay?.kind === 'intro' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]" role="dialog" aria-label={`${pet} moved in`}>
              <div className="pa-pop-in w-full rounded-2xl bg-white p-4 text-center shadow-elevated">
                <p className="text-sm leading-relaxed text-ink">{introCopy(pet, status.level)}</p>
                <button type="button" onClick={() => setOverlay(null)} className="mt-3 w-full rounded-xl bg-rose px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98]">
                  Show me
                </button>
              </div>
            </div>
          )}
        </PetRoomScene>

        {/* Caption and presence */}
        <div className="min-h-[2.5rem] space-y-1 text-center" data-testid="pet-presence">
          {caption && (
            <p className="text-sm leading-relaxed text-ink-light">
              {caption.text}
              {caption.link && (
                <>
                  {' '}
                  <Link href={caption.link.href} className="whitespace-nowrap font-semibold text-rose">{caption.link.label}</Link>
                </>
              )}
            </p>
          )}
          {presence.map((line) => <p key={line} className="text-sm text-ink-muted">{line}</p>)}
          {!saidHiToday && !closed && presence.length === 0 && !caption && (
            <p className="text-sm text-ink-muted">Tap {pet} to say hi</p>
          )}
        </div>

        {notice && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-sm text-ink-light" role="status">{notice}</p>
        )}

        {/* Gestures */}
        <div className="grid grid-cols-3 gap-2.5">
          {GESTURES.map((g) => {
            const Icon = GESTURE_ICON[g]
            return (
              <button
                key={g}
                type="button"
                onClick={() => gestureTap(g)}
                className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-white py-3 text-sm font-semibold text-ink shadow-card transition-all active:scale-95"
              >
                <Icon className="h-5 w-5 text-rose" aria-hidden />
                {GESTURE_LABEL[g]}
              </button>
            )
          })}
        </div>

        {/* Growth */}
        {showProgress && (
          <div data-testid="pet-progress">
            <div className="h-2.5 overflow-hidden rounded-full bg-border/70" role="progressbar" aria-valuemin={0} aria-valuemax={status.xp_per_level} aria-valuenow={status.into_level} aria-label="Warmth toward the next level">
              <div className="h-full rounded-full bg-gradient-to-r from-gold to-rose transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 flex justify-between gap-2 text-xs text-ink-muted">
              <span>{status.into_level}/{status.xp_per_level} warmth</span>
              <span className="truncate">{nextUnlockLabel(status.level)}</span>
            </p>
          </div>
        )}

        {/* Since your last visit */}
        <section aria-labelledby="pet-since" className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 id="pet-since" className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            {firstVisit ? 'Lately' : 'Since your last visit'}
          </h2>
          {since === null ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-rose-50" />)}
            </div>
          ) : since.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-muted">
              {sinceError
                ? "Couldn't load what's new. It shows up next time."
                : firstVisit
                  ? `Nothing yet. What you two do in Nanti Kita shows up here, and ${pet} notices.`
                  : `Nothing new since your last visit. ${pet} is fine with that.`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {since.map((e) => {
                const href = eventHref(e.source, e.detail)
                const body = (
                  <>
                    <span className="min-w-0 flex-1 break-words">{eventLine(e, userId, names, pet)}</span>
                    {e.points > 0 && <span className="shrink-0 font-semibold text-sage-dark">+{e.points}</span>}
                    {href && <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted/60" aria-hidden />}
                  </>
                )
                return (
                  <li key={e.id} className={cn(freshIds.includes(e.id) && 'pa-pop-in')}>
                    {href ? (
                      <Link href={href} className="flex items-center gap-2 py-1 text-sm text-ink-light">{body}</Link>
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-sm text-ink-light">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setSheet('shelf')}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-sm font-semibold text-ink-light shadow-card active:scale-[0.98]">
            <Library className="h-4 w-4 text-ink-muted" /> Shelf
          </button>
          <button type="button" onClick={() => setSheet('notes')}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-sm font-semibold text-ink-light shadow-card active:scale-[0.98]">
            <BookOpen className="h-4 w-4 text-ink-muted" /> Notes
          </button>
        </div>
      </div>

      <PetShelfSheet open={sheet === 'shelf'} onClose={() => { setSheet(null); setFreshLevels([]) }} status={status} room={room}
        sky={sky} initials={initials} solo={solo} fresh={freshLevels} />
      <PetNotesSheet open={sheet === 'notes'} onClose={() => setSheet(null)} petId={petId} petName={pet} version={noteVersion} />
      <PetGrowSheet open={sheet === 'grow'} onClose={() => setSheet(null)} petName={pet} />
      <PetRenameSheet open={sheet === 'rename'} onClose={() => setSheet(null)} petId={petId} name={pet}
        onRenamed={(name) => { const next = { ...statusRef.current, name }; statusRef.current = next; setStatus(next) }} />

      {overlay?.kind === 'home' && (
        <PetCelebration
          type={status.pet_type} stage={status.stage} level={status.level} initials={initials}
          title={`${pet} is home!`}
          detail={solo ? `You said hi, so ${pet} came all the way out of the box.` : `You both said hi, so ${pet} came all the way out of the box.`}
          action="Welcome home"
          onAction={() => closeOverlay(false)}
          onClose={() => closeOverlay(false)}
        />
      )}
      {overlay?.kind === 'level' && celebration && (
        <PetCelebration
          type={status.pet_type} stage={stageForLevel(overlay.to)} level={overlay.to} initials={initials}
          title={celebration.title}
          detail={celebration.detail}
          action="Put it on the shelf"
          onAction={() => closeOverlay(true)}
          onClose={() => closeOverlay(false)}
        />
      )}

      {/* Partner name kept for screen readers when the partner says hi live */}
      <span className="sr-only" aria-live="polite">{partner && status.both_today ? `You and ${partner} both said hi today` : ''}</span>
    </div>
  )
}
