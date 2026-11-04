'use client'

// Pet Kita on Home: one row inside the couple hero (no card of its own).
// With a pet it shows the pet and today's note; with no pet yet (and two
// members) it offers adoption; a partner-less user sees nothing here.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, PawPrint } from 'lucide-react'
import { useCoupleRealtime } from '@/lib/realtime'
import type { PetStatus } from '@/types/pet'
import PetStyles from '@/components/pet/PetStyles'
import { fetchStatus, fetchTodayNote, type ShownNote } from '@/components/pet/api'
import { STATE_LABEL, poseFor } from '@/components/pet/copy'
import PetSvgCat from './PetSvgCat'
import PetSvgDog from './PetSvgDog'

interface Props {
  coupleId: string | null
  hasPartner: boolean
  /** pet_status() from the server render; undefined when it couldn't be read. */
  initialStatus: PetStatus | null | undefined
}

/** The row's line while (or instead of) the note: plain state, never a request. */
function stateText(s: PetStatus): string {
  if (!s.hatched) return `${s.name} just moved in`
  if (s.comfort_for.length) return `${s.name} is staying close today`
  if (s.night) return `${s.name} is asleep`
  return `${s.name} is ${STATE_LABEL[s.mood]}`
}

export default function PetPeek({ coupleId, hasPartner, initialStatus }: Props) {
  const [status, setStatus] = useState<PetStatus | null | undefined>(initialStatus)
  const [note, setNote] = useState<ShownNote | null | 'loading'>('loading')
  const petId = status?.pet_id ?? null
  // One note request at a time (the realtime hook also fires on subscribe).
  const noteBusy = useRef(false)
  const noteAt = useRef(0)

  useEffect(() => {
    if (!petId) { setNote(null); return }
    let cancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    setNote((n) => (n === null ? 'loading' : n))
    const load = () => {
      noteBusy.current = true
      fetchTodayNote(petId)
        .finally(() => { noteBusy.current = false; noteAt.current = Date.now() })
        .then((n) => {
          if (cancelled) return
          setNote(n)
          // A stand-in while the note is being written: ask again shortly.
          if (n?.pending && polls < 3) { polls += 1; timer = setTimeout(load, 4000) }
        })
        .catch(() => { if (!cancelled) setNote(null) })
    }
    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [petId])

  const reload = useCallback(async () => {
    try { setStatus(await fetchStatus()) } catch { /* keep what's shown */ }
  }, [])
  useCoupleRealtime(coupleId, ['couple_pets'], () => { void reload() })
  // A new or finished note while Home is open.
  useCoupleRealtime(petId ? coupleId : null, ['pet_daily_notes'], () => {
    // Skips the fire on subscribe, right after the first load.
    if (!petId || noteBusy.current || Date.now() - noteAt.current < 3000) return
    noteBusy.current = true
    fetchTodayNote(petId)
      .then((n) => { if (n) setNote(n) })
      .catch(() => undefined)
      .finally(() => { noteBusy.current = false })
  })

  if (!coupleId || status === undefined) return null

  if (!status) {
    if (!hasPartner) return null
    return (
      <Link
        href="/app/pet/adopt"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 py-2.5 text-sm font-semibold text-ink-light shadow-card transition-all active:scale-[0.99]"
        data-testid="pet-peek-adopt"
      >
        <PawPrint className="h-4 w-4 text-sage-dark" aria-hidden />
        Adopt Pet Kita together
        <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />
      </Link>
    )
  }

  const Pet = status.pet_type === 'dog' ? PetSvgDog : PetSvgCat
  const pose = poseFor(status, null)
  const line = note && note !== 'loading' ? note.line : null

  return (
    <>
      <PetStyles />
      <Link
        href="/app/pet"
        className="pet-anim flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-white/85 py-2 pl-2 pr-3 text-left shadow-card transition-all active:scale-[0.99]"
        data-testid="pet-peek"
        aria-label={line ? `${status.name}: ${line}` : `Open Pet Kita, ${stateText(status)}`}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FBEFE3]">
          <Pet pose={pose} stage={status.stage} level={status.level} className="h-11 w-11" />
        </span>
        <span className="min-w-0 flex-1">
          {note === 'loading' ? (
            <>
              <span className="block h-3 w-11/12 animate-pulse rounded bg-rose-50" />
              <span className="mt-1.5 block h-3 w-2/3 animate-pulse rounded bg-rose-50" />
            </>
          ) : line ? (
            <span className="line-clamp-2 break-words text-[13px] leading-snug text-ink">&ldquo;{line}&rdquo;</span>
          ) : (
            <span className="block truncate text-[13px] font-semibold text-ink">{stateText(status)}</span>
          )}
          <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{status.name} · Lv {status.level}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
      </Link>
    </>
  )
}
