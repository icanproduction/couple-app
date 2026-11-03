'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Heart, Pencil, RefreshCw, Smile } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'
import { useCoupleRealtime } from '@/lib/realtime'
import { MOOD_KEYS, MOOD_NOTE_MAX, MOODS, listCheckins, moodInfo, saveCheckin, type MoodCheckin, type MoodKey } from '@/lib/mood'
import { cn } from '@/lib/utils'

interface MoodCheckinCardProps {
  coupleId: string | null
  userId: string
  partnerId: string | null
  partnerName: string | null
  /** Hide the "History" link (on /app/mood itself) */
  hideHistoryLink?: boolean
  /** Called after my mood is saved */
  onSaved?: () => void
}

export default function MoodCheckinCard({
  coupleId, userId, partnerId, partnerName, hideHistoryLink, onSaved,
}: MoodCheckinCardProps) {
  const [rows, setRows] = useState<MoodCheckin[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<MoodKey | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  /** The Jakarta day `rows` belong to; after midnight they are yesterday's */
  const loadedDay = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!coupleId) return
    try {
      const today = todayJakarta()
      const list = await listCheckins(createClient(), coupleId, today)
      setRows(list.filter((r) => r.checkin_date === today))
      loadedDay.current = today
      setLoadError('')
    } catch {
      setLoadError("Couldn't load today's moods.")
    } finally {
      setLoaded(true)
    }
  }, [coupleId])

  useEffect(() => { load() }, [load])
  useCoupleRealtime(coupleId, ['mood_checkins'], load)
  // A card left open overnight moves on to the new day by itself
  useEffect(() => {
    const timer = setInterval(() => {
      if (loadedDay.current && loadedDay.current !== todayJakarta()) load()
    }, 60_000)
    return () => clearInterval(timer)
  }, [load])

  if (!coupleId) return null

  const mine = rows.find((r) => r.profile_id === userId) ?? null
  const partnerRow = partnerId ? rows.find((r) => r.profile_id === partnerId) ?? null : null
  const myMood = moodInfo(mine?.mood)
  const partnerMood = moodInfo(partnerRow?.mood)
  const showPicker = !mine || editing
  const who = partnerName ?? 'Your partner'

  function startEdit() {
    setSelected(mine && moodInfo(mine.mood) ? (mine.mood as MoodKey) : null)
    setNote(mine?.note ?? '')
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSelected(null)
    setNote('')
    setSaveError('')
  }

  async function save() {
    if (!coupleId || !selected || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const today = todayJakarta()
      // Past midnight since the last load: fetch today's rows (the partner's
      // mood) first instead of showing yesterday's next to my new one.
      if (loadedDay.current !== today) await load()
      const row = await saveCheckin(createClient(), {
        coupleId, userId, mood: selected, note: note || null, date: today,
      })
      setRows((prev) => [...prev.filter((r) => r.profile_id !== userId && r.checkin_date === row.checkin_date), row])
      setEditing(false)
      setSelected(null)
      setNote('')
      onSaved?.()
    } catch {
      // Keep the picked mood and note so nothing is lost
      setSaveError("Your mood wasn't saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-6 overflow-hidden rounded-2xl border border-border bg-white shadow-card">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gold/15">
            <Smile className="h-3.5 w-3.5 text-yellow-700" strokeWidth={2} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Daily Mood</span>
        </div>
        {!hideHistoryLink && (
          <Link href="/app/mood" className="flex items-center gap-0.5 text-xs font-semibold text-rose">
            History <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {!loaded ? (
        <div className="space-y-2 px-4 pb-4">
          <div className="h-16 animate-pulse rounded-xl bg-rose-50" />
          <div className="h-10 animate-pulse rounded-xl bg-rose-50" />
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <p className="text-xs text-red-600">{loadError}</p>
          <button
            onClick={() => load()}
            className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-ink-light"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : (
        <>
          {/* Me */}
          <div className="px-4 pb-4">
            {showPicker ? (
              <>
                <p className="mb-2.5 text-sm font-medium text-ink">
                  {editing ? 'Change your mood for today' : 'How are you feeling today?'}
                </p>
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="Pick a mood">
                  {MOOD_KEYS.map((key) => {
                    const m = MOODS[key]
                    const active = selected === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        aria-pressed={active}
                        aria-label={`Mood: ${m.label}`}
                        className={cn(
                          'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-all active:scale-95',
                          active ? 'border-transparent shadow-card' : 'border-border bg-white hover:bg-cream'
                        )}
                        style={active ? { backgroundColor: m.soft, boxShadow: `0 0 0 2px ${m.color}` } : undefined}
                      >
                        <span className="text-2xl leading-none" aria-hidden>{m.emoji}</span>
                        <span className="text-[10px] font-semibold text-ink-light">{m.label}</span>
                      </button>
                    )
                  })}
                </div>

                {selected && (
                  <div className="mt-3 animate-fade-in">
                    <label htmlFor="mood-note" className="sr-only">Mood note (optional)</label>
                    <textarea
                      id="mood-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, MOOD_NOTE_MAX))}
                      maxLength={MOOD_NOTE_MAX}
                      rows={2}
                      placeholder="Want to say a bit more? (optional)"
                      className="w-full resize-none rounded-xl border border-border bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-rose focus:outline-none focus:ring-1 focus:ring-rose/20"
                    />
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[11px] text-ink-muted">{note.length}/{MOOD_NOTE_MAX}</p>
                      <div className="flex gap-2">
                        {editing && (
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-xl px-3 py-2 text-xs font-semibold text-ink-muted"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={save}
                          disabled={saving}
                          className="rounded-xl bg-rose px-4 py-2 text-xs font-bold text-white shadow-elevated disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {editing && !selected && (
                  <button type="button" onClick={cancelEdit} className="mt-2 text-xs font-semibold text-ink-muted">
                    Cancel
                  </button>
                )}
                {saveError && <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p>}
              </>
            ) : (
              myMood && mine && (
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                    style={{ backgroundColor: myMood.soft }}
                    aria-hidden
                  >
                    {myMood.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      Your mood: <span className="font-bold" style={{ color: myMood.color }}>{myMood.label.toLowerCase()}</span>
                    </p>
                    {mine.note && <p className="mt-0.5 break-words text-xs italic text-ink-light">“{mine.note}”</p>}
                  </div>
                  <button
                    type="button"
                    onClick={startEdit}
                    aria-label="Change today's mood"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border text-ink-muted hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            )}
          </div>

          {/* Partner */}
          <div className="border-t border-border bg-cream/50 px-4 py-3">
            {!partnerId ? (
              <p className="text-xs text-ink-muted">
                Your partner hasn&apos;t joined yet. Once they do, you&apos;ll see each other&apos;s moods here.
              </p>
            ) : partnerMood && partnerRow ? (
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                    style={{ backgroundColor: partnerMood.soft }}
                    aria-hidden
                  >
                    {partnerMood.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      {who}&apos;s mood: <span className="font-bold" style={{ color: partnerMood.color }}>{partnerMood.label.toLowerCase()}</span>
                    </p>
                    {partnerRow.note && (
                      <p className="mt-0.5 break-words text-xs italic text-ink-light">“{partnerRow.note}”</p>
                    )}
                  </div>
                </div>
                <p
                  className="flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
                  style={{ backgroundColor: partnerMood.soft, color: partnerMood.color }}
                >
                  <Heart className="mt-0.5 h-3 w-3 shrink-0" fill="currentColor" />
                  {partnerMood.suggestion}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                <p className="text-xs text-ink-muted">{who} hasn&apos;t checked in today</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
