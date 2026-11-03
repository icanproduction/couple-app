'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Heart, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import {
  GRATITUDE_MAX, deleteNote, listNotes, openNote, pickRandom, sendNote, splitNotes, type GratitudeNote,
} from '@/lib/gratitude'

const PAPER_COLORS = ['#FDE6EF', '#FFF4DB', '#E0F2EF', '#EFEBFA', '#FFEBDD', '#E6EFFA']
const MAX_PAPERS = 15

function dateOf(iso: string): string {
  return formatDateID(todayJakarta(new Date(iso)))
}

export default function ToplesPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nocouple' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [notes, setNotes] = useState<GratitudeNote[]>([])

  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sentFlash, setSentFlash] = useState(false)

  const [drawing, setDrawing] = useState(false)
  const [drawError, setDrawError] = useState('')
  const [reveal, setReveal] = useState<GratitudeNote | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<GratitudeNote | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let cancelled = false
    getCoupleInfo()
      .then((i) => {
        if (cancelled) return
        if (!i) { router.replace('/auth/login'); return }
        if (!i.coupleId) { setStatus('nocouple'); return }
        setInfo(i)
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [router, attempt])

  const load = useCallback(async () => {
    if (!info?.coupleId) return
    try {
      setNotes(await listNotes(createClient(), info.coupleId))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [info])

  useEffect(() => { load() }, [load])
  useCoupleRealtime(info?.coupleId, ['gratitude_notes'], load)

  const closeReveal = useCallback(() => setReveal(null), [])

  useEffect(() => {
    if (!sentFlash) return
    const t = setTimeout(() => setSentFlash(false), 3500)
    return () => clearTimeout(t)
  }, [sentFlash])

  const partnerId = info?.partnerId ?? null
  const partnerName = partnerId ? info?.names[partnerId] ?? 'your partner' : 'your partner'
  const myName = info ? info.names[info.userId] ?? 'Your partner' : 'Your partner'
  const jar = info ? splitNotes(notes, info.userId) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!info?.coupleId || !partnerId || sending || !body.trim()) return
    setSending(true)
    setSendError('')
    try {
      const note = await sendNote(createClient(), { coupleId: info.coupleId, fromId: info.userId, toId: partnerId, body })
      setNotes((prev) => [note, ...prev])
      setBody('')
      setSentFlash(true)
      // Best-effort; never block the UI. The push never carries the note text.
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: 'Jar',
          body: `${myName} put a new note of thanks in your Jar`,
          url: '/app/toples',
          kind: 'activity',
        }),
      }).catch(() => {})
    } catch {
      setSendError("Your note didn't make it into the Jar. Try again.")
    } finally {
      setSending(false)
    }
  }

  async function drawOne() {
    if (!jar || !info?.coupleId || drawing) return
    const { coupleId, userId } = info
    setDrawing(true)
    setDrawError('')
    try {
      const client = createClient()
      let candidates = jar.waiting
      for (let tries = 0; tries < 2; tries++) {
        const pick = pickRandom(candidates)
        if (!pick) break
        const opened = await openNote(client, pick.id)
        if (opened) {
          setReveal(opened)
          setNotes((prev) => prev.map((n) => (n.id === opened.id ? opened : n)))
          return
        }
        // Already opened elsewhere (another tab); refresh and try once more.
        const fresh = await listNotes(client, coupleId)
        setNotes(fresh)
        candidates = splitNotes(fresh, userId).waiting
      }
      setDrawError('The Jar is empty after all. Wait for the next note.')
    } catch {
      setDrawError("Couldn't take a note out. Try again.")
    } finally {
      setDrawing(false)
    }
  }

  async function doDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const removed = await deleteNote(createClient(), confirmDelete.id)
      if (!removed) setDeleteError(`That note was already opened by ${partnerName}, so it can't be deleted.`)
      setConfirmDelete(null)
      await load()
    } catch {
      setDeleteError("Couldn't delete it. Try again.")
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/jelajah" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Jelajah
        </Link>
        <h1 className="text-xl font-bold text-ink">Jar</h1>
        <p className="text-sm text-ink-muted">Little notes of thanks for {partnerName}</p>
      </div>

      {status === 'loading' ? (
        <div className="space-y-4 px-6 pt-5">
          <div className="h-64 animate-pulse rounded-2xl bg-rose-50" />
          <div className="h-36 animate-pulse rounded-2xl bg-rose-50" />
        </div>
      ) : status === 'nocouple' ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Connect with your partner first to start filling the Jar.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : status === 'error' && !jar ? (
        <ErrorBox onRetry={() => { setStatus('loading'); setAttempt((n) => n + 1) }} />
      ) : jar ? (
        <div className="space-y-5 pt-5">
          {status === 'error' && <ErrorBox onRetry={() => load()} />}

          {/* The jar */}
          <section className="mx-6 rounded-2xl border border-border bg-white p-5 shadow-card">
            <Jar count={jar.waiting.length} />
            <div className="mt-4 text-center">
              {jar.waiting.length > 0 ? (
                <>
                  <p className="text-base font-bold text-ink">
                    {jar.waiting.length} {jar.waiting.length === 1 ? 'note' : 'notes'} waiting for you
                  </p>
                  <p className="text-xs text-ink-muted">Take one out anytime, especially on a hard day</p>
                  <button
                    onClick={drawOne}
                    disabled={drawing}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose px-6 py-3 text-sm font-bold text-white shadow-elevated active:scale-[0.98] disabled:opacity-60"
                  >
                    {drawing ? 'Taking one out…' : 'Take one out'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-ink">Your Jar is empty</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
                    {partnerId
                      ? `When ${partnerName} writes you a note of thanks, it shows up here.`
                      : 'Once your partner joins, their notes will land here.'}
                  </p>
                </>
              )}
              {drawError && <p className="mt-3 text-xs font-medium text-red-600">{drawError}</p>}
            </div>
          </section>

          {/* Write */}
          <section className="mx-6 rounded-2xl border border-border bg-white p-4 shadow-card">
            <h2 className="text-sm font-bold text-ink">Write a note for {partnerName}</h2>
            {partnerId ? (
              <form onSubmit={submit} className="mt-3">
                <label htmlFor="gratitude-body" className="sr-only">Note of thanks for {partnerName}</label>
                <textarea
                  id="gratitude-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, GRATITUDE_MAX))}
                  maxLength={GRATITUDE_MAX}
                  rows={3}
                  placeholder={`I'm thankful that ${partnerName}…`}
                  className="w-full resize-none rounded-xl border border-border bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-rose focus:outline-none focus:ring-1 focus:ring-rose/20"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-ink-muted">
                    {body.length}/{GRATITUDE_MAX} · hidden until {partnerName} takes it out
                  </p>
                  <button
                    type="submit"
                    disabled={sending || !body.trim()}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose px-4 py-2 text-xs font-bold text-white shadow-elevated disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Put it in'}
                  </button>
                </div>
                {sendError && <p className="mt-2 text-xs font-medium text-red-600">{sendError}</p>}
                {sentFlash && (
                  <p className="mt-2 flex animate-fade-in items-center gap-1.5 rounded-xl bg-sage/10 px-3 py-2 text-xs font-semibold text-sage-dark" role="status">
                    <Check className="h-3.5 w-3.5" /> Added to {partnerName}&apos;s Jar
                  </p>
                )}
              </form>
            ) : (
              <div className="mt-2 rounded-xl bg-cream px-3 py-3">
                <p className="text-xs text-ink-muted">
                  Your partner hasn&apos;t joined yet. Share the invite code from Profile so you can fill each other&apos;s Jar.
                </p>
                <Link href="/app/profile" className="mt-2 inline-block text-xs font-semibold text-rose">Go to Profile</Link>
              </div>
            )}
          </section>

          {/* Sent */}
          {jar.sent.length > 0 && (
            <section className="mx-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">What you sent</h2>
                <p className="text-[11px] text-ink-muted">
                  {jar.sent.length} sent · {jar.sentOpened} opened by {partnerName}
                </p>
              </div>
              {deleteError && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{deleteError}</p>}
              <ul className="space-y-2">
                {jar.sent.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 rounded-2xl border border-border bg-white p-3 shadow-card">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-ink">{n.body}</p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {dateOf(n.created_at)} ·{' '}
                        {n.opened_at
                          ? <span className="font-semibold text-sage-dark">Opened {dateOf(n.opened_at)}</span>
                          : 'Still in the Jar'}
                      </p>
                    </div>
                    {!n.opened_at && (
                      <button
                        type="button"
                        onClick={() => { setDeleteError(''); setConfirmDelete(n) }}
                        aria-label="Delete this note"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-danger hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Opened by me */}
          <section className="mx-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes you&apos;ve opened</h2>
            {jar.opened.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-ink-muted">
                Notes you take out are kept here.
              </p>
            ) : (
              <ul className="space-y-2">
                {jar.opened.map((n, i) => (
                  <li
                    key={n.id}
                    className="rounded-2xl p-4 shadow-card"
                    style={{ backgroundColor: PAPER_COLORS[i % PAPER_COLORS.length] }}
                  >
                    <p className="break-words text-sm leading-relaxed text-ink">{n.body}</p>
                    <p className="mt-2 text-[11px] text-ink-light">
                      From {info?.names[n.from_id] ?? 'your partner'} · written {dateOf(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {reveal && (
        <Reveal note={reveal} fromName={info?.names[reveal.from_id] ?? 'your partner'} onClose={closeReveal} />
      )}

      <Modal open={!!confirmDelete} onClose={() => !deleting && setConfirmDelete(null)} title="Delete this note?">
        <p className="mb-5 break-words text-sm text-ink-light">
          “{confirmDelete?.body}” will come out of {partnerName}&apos;s Jar before they open it.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={doDelete} loading={deleting}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
      <p className="text-sm text-red-600">Couldn&apos;t load the Jar.</p>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs font-semibold text-red-600">
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  )
}

/** A glass jar holding one folded paper per waiting note (capped) */
function Jar({ count }: { count: number }) {
  const papers = Math.min(count, MAX_PAPERS)
  return (
    <div className="relative mx-auto h-48 w-40" role="img" aria-label={`Jar holding ${count} ${count === 1 ? 'note' : 'notes'}`}>
      {/* Lid */}
      <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-lg bg-gold shadow-card" />
      <div className="absolute left-1/2 top-4 h-3 w-24 -translate-x-1/2 rounded-sm bg-gold-dark/60" />
      {/* Glass */}
      <div className="absolute inset-x-0 bottom-0 top-6 overflow-hidden rounded-b-[2.75rem] rounded-t-3xl border-2 border-rose-100 bg-gradient-to-b from-white to-rose-50/70">
        {Array.from({ length: papers }, (_, i) => {
          const row = Math.floor(i / 4)
          const col = i % 4
          const offset = row % 2 ? 12 : 0
          return (
            <div
              key={i}
              className="absolute h-7 w-7 rounded-md border border-white/80 shadow-sm"
              style={{
                left: `${10 + offset + col * 28}px`,
                bottom: `${8 + row * 20}px`,
                transform: `rotate(${((i * 37) % 50) - 25}deg)`,
                backgroundColor: PAPER_COLORS[i % PAPER_COLORS.length],
              }}
            />
          )
        })}
        {count === 0 && (
          <div className="flex h-full items-center justify-center">
            <Heart className="h-8 w-8 text-rose-100" />
          </div>
        )}
        {/* Shine */}
        <div className="absolute bottom-6 left-3 top-6 w-2 rounded-full bg-white/70" />
      </div>
      {count > 0 && (
        <span className="absolute -right-2 top-8 z-20 flex h-8 min-w-8 items-center justify-center rounded-full bg-rose px-2 text-sm font-bold text-white shadow-elevated">
          {count}
        </span>
      )}
    </div>
  )
}

/** Full-screen reveal: the folded note pops out, then unfolds */
function Reveal({ note, fromName, onClose }: { note: GratitudeNote; fromName: string; onClose: () => void }) {
  const [stage, setStage] = useState<'folded' | 'open'>('folded')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setStage('open'), reduce ? 0 : 750)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (stage === 'open') closeRef.current?.focus()
  }, [stage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
    >
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      {stage === 'folded' ? (
        <div className="relative flex h-24 w-24 animate-bounce items-center justify-center rounded-2xl bg-[#FFF4DB] text-4xl shadow-elevated motion-reduce:animate-none">
          <span aria-hidden>💌</span>
          <span id="reveal-title" className="sr-only">Opening the note…</span>
        </div>
      ) : (
        <div className="relative w-full max-w-sm animate-scale-in rounded-3xl bg-[#FFF4DB] p-6 shadow-elevated motion-reduce:animate-none">
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-3xl" aria-hidden>💌</p>
          <p id="reveal-title" className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            From {fromName}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-lg font-medium leading-relaxed text-ink">{note.body}</p>
          <p className="mt-4 text-[11px] text-ink-light">Written {dateOf(note.created_at)}</p>
          <button
            onClick={onClose}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-3 text-sm font-bold text-white shadow-elevated"
          >
            <Heart className="h-4 w-4" fill="currentColor" /> Keep it close
          </button>
        </div>
      )}
    </div>
  )
}
