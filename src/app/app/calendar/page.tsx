'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Trash2, CalendarDays, Gift, Heart, Star, Bell, Pencil, Camera,
  MapPin, Wallet, Sparkles, ChevronRight, ChevronLeft, RefreshCw, Users, User,
} from 'lucide-react'
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useCoupleRealtime } from '@/lib/realtime'
import { daysUntil, getNextOccurrence, formatDateID, todayJakarta } from '@/lib/dates'
import { REMIND_OPTIONS, flipScopeForViewer as flipScope, occursOn as occursOnDate, remindLabel } from '@/lib/reminders'
import { getRandomDateIdea, type DateIdea } from '@/data/dateIdeas'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface CoupleEvent {
  id: string
  title: string
  event_date: string
  event_type: string
  is_recurring: boolean
  description: string | null
  location: string | null
  event_scope: string | null
  budget: number | null
  is_completed: boolean | null
  created_by: string | null
  remind_days_before: number | null
}

/** No session, or the auth server rejected it (not a network failure) */
function isSignedOutError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429
}

type Tab = 'semua' | 'personal' | 'partner' | 'couple'
type Owner = 'me' | 'partner' | 'couple'

/**
 * Whose event this is, from MY point of view. event_scope is written from the
 * creator's point of view: "personal" = the creator's own, "partner" = for the
 * creator's partner. So the partner's "personal" event is "Partner's" for me.
 */
function ownerOf(ev: CoupleEvent, userId: string | null): Owner {
  const createdByMe = !ev.created_by || ev.created_by === userId
  if (ev.event_scope === 'personal') return createdByMe ? 'me' : 'partner'
  if (ev.event_scope === 'partner') return createdByMe ? 'partner' : 'me'
  return 'couple'
}

/**
 * Does the event fall on this date ("YYYY-MM-DD")? Recurring events repeat
 * every year on their month/day from their first date on (Feb 29 → Mar 1 in
 * non-leap years, like getNextOccurrence). Shared with the reminder cron.
 */
function occursOn(ev: CoupleEvent, dateKey: string): boolean {
  return occursOnDate(ev.event_date, ev.is_recurring, dateKey)
}

/** Types that get location + budget fields and the "Save as a Moment" link */
const OUTING_TYPES = ['date_plan', 'event']

function momentHref(ev: { title: string; location: string | null }, date: string): string {
  const params = new URLSearchParams({ title: ev.title, date })
  if (ev.location) params.set('location', ev.location)
  return `/app/moments/baru?${params.toString()}`
}

function RemindPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        <Bell className="h-3 w-3" /> Remind me
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {REMIND_OPTIONS.map(opt => (
          <button key={String(opt.value)} type="button" onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`rounded-lg border px-1 py-1.5 text-xs font-medium transition-colors ${
              value === opt.value ? 'border-rose bg-rose-50 text-rose' : 'border-border text-ink-muted hover:border-rose'
            }`}>{opt.label}</button>
        ))}
      </div>
    </div>
  )
}

const EVENT_ICONS: Record<string, typeof Heart> = {
  anniversary: Heart, birthday: Gift, milestone: Star,
  date_plan: MapPin, reminder: Bell, event: CalendarDays, other: CalendarDays,
}

const EVENT_COLORS: Record<string, string> = {
  anniversary: 'bg-rose/10 text-rose', birthday: 'bg-gold/20 text-yellow-700',
  milestone: 'bg-sage/20 text-sage-dark', date_plan: 'bg-purple-100 text-purple-600',
  reminder: 'bg-blue-50 text-blue-600', event: 'bg-ink/5 text-ink-muted', other: 'bg-ink/5 text-ink-muted',
}

const EVENT_DOT_COLORS: Record<string, string> = {
  anniversary: 'bg-rose', birthday: 'bg-yellow-500',
  milestone: 'bg-sage', date_plan: 'bg-purple-500',
  reminder: 'bg-blue-500', event: 'bg-ink-muted', other: 'bg-ink-muted',
}

// Keyed by owner (my point of view), not by the raw event_scope
const OWNER_LABELS: Record<Owner, { icon: typeof Users; label: string }> = {
  couple: { icon: Users, label: 'Together' },
  me: { icon: User, label: 'Mine' },
  partner: { icon: Heart, label: "Partner's" },
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function countdownText(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  return `In ${days} days`
}

function dayName(dateStr: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(dateStr + 'T00:00:00').getDay()]
}

export default function CalendarPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [events, setEvents] = useState<CoupleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('semua') // copy-ok: internal tab key
  const [modalOpen, setModalOpen] = useState(false)
  const [datePlanModal, setDatePlanModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Calendar navigation: "today" is the Jakarta date, not the device clock's
  const todayKey = todayJakarta()
  const [calMonth, setCalMonth] = useState(() => Number(todayJakarta().slice(5, 7)) - 1)
  const [calYear, setCalYear] = useState(() => Number(todayJakarta().slice(0, 4)))

  // Form state
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('event')
  const [newScope, setNewScope] = useState('couple')
  const [newRecurring, setNewRecurring] = useState(false)
  const [newDescription, setNewDescription] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newRemind, setNewRemind] = useState<number | null>(null)
  /** Set while the form edits an existing event (F08) */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** The edited event was created by my partner: its scope is stored from their side */
  const [editingPartnerEvent, setEditingPartnerEvent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [listError, setListError] = useState('')
  const [loadError, setLoadError] = useState('')
  /** Event whose inline "delete?" confirm is open */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [dateIdea, setDateIdea] = useState<DateIdea | null>(null)

  // Runs on mount, on every realtime change and when the app comes back to the
  // foreground. A failed run keeps what is on screen and offers a retry.
  const loadData = useCallback(async () => {
    const failed = () => { setLoadError("Couldn't load the calendar. Check your connection and try again."); setLoading(false) }
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      // A network blip is not a logout: keep the page and offer a retry.
      if (!authError || isSignedOutError(authError)) router.replace('/auth/login')
      else failed()
      return
    }
    setUserId(user.id)

    const { data: membership, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (memberError) { failed(); return }
    if (!membership?.couple_id) { setLoading(false); return }
    setCoupleId(membership.couple_id)

    // Load my name + partner id
    const { data: myProfile } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
    if (myProfile) setUserName(myProfile.name ?? null)
    const { data: members } = await supabase.from('couple_members').select('profile_id').eq('couple_id', membership.couple_id).neq('profile_id', user.id)
    if (members?.[0]) setPartnerId(members[0].profile_id)

    const { data, error } = await supabase
      .from('couple_events').select('*').eq('couple_id', membership.couple_id).order('event_date')

    if (error) { failed(); return }
    setEvents(data ?? []); setLoadError('')
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])
  useCoupleRealtime(coupleId, ['couple_events'], loadData)
  useEffect(() => { setDateIdea(getRandomDateIdea()) }, [])

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1)
    let startDow = firstDay.getDay() - 1 // Monday = 0
    if (startDow < 0) startDow = 6
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const prevMonthDays = new Date(calYear, calMonth, 0).getDate()

    const cells: Array<{ day: number; month: 'prev' | 'current' | 'next'; dateKey: string }> = []

    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = calMonth === 0 ? 11 : calMonth - 1
      const y = calMonth === 0 ? calYear - 1 : calYear
      cells.push({ day: d, month: 'prev', dateKey: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: 'current', dateKey: `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    // Next month padding to fill 6 rows
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      const m = calMonth === 11 ? 0 : calMonth + 1
      const y = calMonth === 11 ? calYear + 1 : calYear
      cells.push({ day: d, month: 'next', dateKey: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    return cells
  }, [calMonth, calYear])

  // Events per visible cell. Recurring events show on their month/day in
  // every displayed year, not only at their next occurrence.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CoupleEvent[]>()
    for (const cell of calendarDays) {
      const list = events.filter(ev => occursOn(ev, cell.dateKey))
      if (list.length > 0) map.set(cell.dateKey, list)
    }
    return map
  }, [events, calendarDays])

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
    setSelectedDate(null)
  }
  function goToday() {
    setCalMonth(Number(todayKey.slice(5, 7)) - 1)
    setCalYear(Number(todayKey.slice(0, 4)))
    setSelectedDate(todayKey)
  }

  function resetForm() {
    setNewTitle(''); setNewDate(''); setNewType('event'); setNewScope('couple')
    setNewRecurring(false); setNewDescription(''); setNewLocation(''); setNewBudget('')
    setNewRemind(null); setEditingId(null); setEditingPartnerEvent(false)
    setFormError('')
  }

  /** Open the same form prefilled with an existing event (F08) */
  function openEdit(ev: CoupleEvent) {
    const byPartner = !!ev.created_by && ev.created_by !== userId
    setEditingId(ev.id); setEditingPartnerEvent(byPartner)
    setNewTitle(ev.title); setNewDate(ev.event_date); setNewType(ev.event_type)
    setNewScope(flipScope(ev.event_scope ?? 'couple', byPartner)); setNewRecurring(ev.is_recurring)
    setNewDescription(ev.description ?? ''); setNewLocation(ev.location ?? '')
    setNewBudget(ev.budget != null ? Number(ev.budget).toLocaleString('id-ID') : '')
    setNewRemind(ev.remind_days_before ?? null)
    setFormError(''); setModalOpen(true)
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!coupleId || !userId || !newTitle.trim() || !newDate || saving) return
    setSaving(true)
    setFormError('')
    const supabase = createClient()
    const isEdit = editingId !== null
    const fields = {
      title: newTitle.trim(), event_date: newDate,
      event_type: newType, is_recurring: newRecurring,
      // Back to the creator's point of view (only my partner's events differ)
      event_scope: flipScope(newScope, isEdit && editingPartnerEvent),
      description: newDescription.trim() || null, location: newLocation.trim() || null,
      budget: newBudget ? parseInt(newBudget.replace(/\D/g, ''), 10) : null,
      remind_days_before: newRemind,
    }
    const { data, error } = isEdit
      ? await supabase.from('couple_events').update(fields).eq('id', editingId).select('id')
      : await supabase.from('couple_events').insert({ ...fields, couple_id: coupleId, created_by: userId }).select('id')
    if (error || !data?.length) {
      // Keep the form open with everything that was typed
      setFormError(isEdit && !error
        ? 'This event is gone. Your partner may have just deleted it.'
        : "Couldn't save the event. Try again.")
      setSaving(false)
      return
    }
    // Notify partner about a new entry (best-effort, never blocks the form)
    if (partnerId && !isEdit) {
      const typeLabel = newType === 'date_plan' ? 'a date plan' : newType === 'reminder' ? 'a reminder' : 'an event'
      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: 'Nanti Kita',
          body: `${userName ?? 'Your partner'} added ${typeLabel}: "${newTitle.trim()}"`,
          url: '/app/calendar',
          kind: 'activity',
        }),
      }).catch(() => { /* optional */ })
    }

    resetForm(); setSaving(false); setModalOpen(false); setDatePlanModal(false)
    loadData()
  }

  function openDatePlanFromIdea(idea: DateIdea) {
    // Start clean: no date, location or budget left over from an earlier draft
    resetForm()
    setNewTitle(idea.title); setNewDescription(idea.description)
    setNewType('date_plan'); setDatePlanModal(true)
  }

  async function deleteEvent(id: string) {
    if (deletingId) return
    setListError(''); setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('couple_events').delete().eq('id', id)
    setDeletingId(null)
    if (error) { setListError("Couldn't delete the event. Try again."); return }
    setConfirmDeleteId(null)
    setEvents(prev => prev.filter(ev => ev.id !== id))
  }

  async function toggleComplete(ev: CoupleEvent) {
    setListError('')
    const supabase = createClient()
    const { error } = await supabase.from('couple_events').update({ is_completed: !ev.is_completed }).eq('id', ev.id)
    if (error) { setListError("Couldn't update the date plan. Try again."); return }
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_completed: !e.is_completed } : e))
  }

  // Filter by whose event it is (from my point of view), not by raw scope
  const filtered = events.filter(ev => {
    if (tab === 'personal') return ownerOf(ev, userId) === 'me'
    if (tab === 'partner') return ownerOf(ev, userId) === 'partner'
    if (tab === 'couple') return ownerOf(ev, userId) === 'couple'
    return true
  })

  // With a date selected, show that date's occurrence; otherwise the next one.
  // Upcoming first (soonest first), then past events (most recent first).
  const sorted = filtered
    .filter(ev => !selectedDate || occursOn(ev, selectedDate))
    .map(ev => {
      const shownDate = selectedDate ?? (ev.is_recurring ? getNextOccurrence(ev.event_date) : ev.event_date)
      return { ...ev, nextDate: shownDate, daysLeft: daysUntil(shownDate) }
    })
    .sort((a, b) => {
      const aPast = a.daysLeft < 0
      const bPast = b.daysLeft < 0
      if (aPast !== bPast) return aPast ? 1 : -1
      return aPast ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft
    })

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  const countOwner = (o: Owner) => events.filter(e => ownerOf(e, userId) === o).length
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'semua', label: 'All', count: events.length }, // copy-ok: internal tab key
    { key: 'personal', label: 'Mine', count: countOwner('me') },
    { key: 'partner', label: "Partner's", count: countOwner('partner') },
    { key: 'couple', label: 'Together', count: countOwner('couple') },
  ]

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Calendar</h1>
          <p className="text-xs text-ink-muted">Big days and date plans</p>
        </div>
        <button onClick={() => { resetForm(); setModalOpen(true) }}
          aria-label="Add event"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose text-white shadow-sm">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* ===== CALENDAR GRID ===== */}
      <div className="bg-white px-4 pb-3 pt-2">
        {/* Month nav */}
        <div className="mb-3 flex items-center justify-between">
          <button onClick={prevMonth} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cream">
            <ChevronLeft className="h-4 w-4 text-ink-muted" />
          </button>
          <button onClick={goToday} className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-ink">{MONTH_NAMES[calMonth]}</span>
            <span className="text-sm text-ink-muted">{calYear}</span>
          </button>
          <button onClick={nextMonth} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cream">
            <ChevronRight className="h-4 w-4 text-ink-muted" />
          </button>
        </div>

        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 text-center">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/60">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((cell, i) => {
            const dayEvents = eventsByDate.get(cell.dateKey) ?? []
            const isToday = cell.dateKey === todayKey
            const isSelected = cell.dateKey === selectedDate
            const isOtherMonth = cell.month !== 'current'

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : cell.dateKey)}
                className={`relative flex flex-col items-center py-1.5 transition-all ${
                  isOtherMonth ? 'opacity-30' : ''
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-rose text-white font-bold scale-110'
                    : isToday
                      ? 'bg-rose/10 text-rose font-bold ring-1 ring-rose/30'
                      : 'text-ink hover:bg-cream'
                }`}>
                  {cell.day}
                </span>
                {/* Event dots */}
                {dayEvents.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <span key={j} className={`h-1 w-1 rounded-full ${
                        isSelected ? 'bg-white' : (EVENT_DOT_COLORS[ev.event_type] ?? 'bg-ink-muted')
                      }`} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date header */}
      {selectedDate && (
        <div className="mx-6 mt-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">{dayName(selectedDate)}, {formatDateID(selectedDate)}</p>
            <p className="text-xs text-ink-muted">{countdownText(daysUntil(selectedDate))}</p>
          </div>
          <button onClick={() => setSelectedDate(null)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose hover:bg-rose/5">
            See all
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-2 flex gap-1 overflow-x-auto border-b border-border bg-white px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelectedDate(null) }}
            aria-pressed={tab === t.key}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-rose text-white' : 'text-ink-muted hover:bg-cream'
            }`}>
            {t.label}
            {t.count > 0 && <span className={`rounded-full px-1.5 text-[10px] ${
              tab === t.key ? 'bg-white/20' : 'bg-border'
            }`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="px-6 pt-4 space-y-4">
        {/* Date Idea Suggestion Card */}
        {!selectedDate && dateIdea && (
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-rose-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-purple-600">Date idea</span>
              </div>
              <button onClick={() => setDateIdea(getRandomDateIdea())} aria-label="Show another date idea"
                className="rounded-lg p-1 text-purple-400 hover:text-purple-600">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm font-bold text-ink">{dateIdea.title}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{dateIdea.description}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Wallet className="h-3 w-3" /> {dateIdea.estimatedBudget}
              </span>
              <button onClick={() => openDatePlanFromIdea(dateIdea)}
                className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline">
                Plan this date <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            <span>{loadError}</span>
            <button onClick={() => { void loadData() }} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">
              Try again
            </button>
          </div>
        )}
        {listError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{listError}</p>
        )}

        {/* Event List */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-ink-muted/30" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-ink-muted">
              {selectedDate ? 'Nothing on this day' : tab === 'personal' ? 'None of your own events yet' : tab === 'partner' ? "None of your partner's events yet" : tab === 'couple' ? 'No shared events yet' : 'No events yet'}
            </p>
            <p className="text-xs text-ink-muted/60">Tap + to add one</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sorted.map(ev => {
              const Icon = EVENT_ICONS[ev.event_type] ?? CalendarDays
              const colorClass = EVENT_COLORS[ev.event_type] ?? EVENT_COLORS.other
              const isToday = ev.daysLeft === 0
              const isPast = ev.daysLeft < 0
              const scopeInfo = OWNER_LABELS[ownerOf(ev, userId)]
              const remindText = remindLabel(ev.remind_days_before)
              // A past outing (or a finished date plan) can become a Moment
              const canMoment = OUTING_TYPES.includes(ev.event_type) && (isPast || (!!ev.is_completed && ev.daysLeft <= 0))

              return (
                <div key={ev.id}
                  className={`rounded-2xl border bg-white shadow-card overflow-hidden ${
                    isToday ? 'border-rose' : ev.is_completed ? 'border-sage/30 opacity-60' : 'border-border'
                  }`}>
                  {/* Narrow phones: title may take two lines and the meta chips wrap
                      under the date, so nothing squeezes into the countdown badge. */}
                  <div className="flex items-start gap-3 p-4">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`line-clamp-2 break-words text-sm font-semibold ${ev.is_completed ? 'line-through text-ink-muted' : 'text-ink'}`}>
                        {ev.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {dayName(ev.nextDate)}, {formatDateID(ev.nextDate)}
                      </p>
                      {(ev.is_recurring || scopeInfo || remindText) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-ink-muted/60">
                          {ev.is_recurring && <span className="whitespace-nowrap">Every year</span>}
                          {scopeInfo && (
                            <span className="flex items-center gap-0.5 whitespace-nowrap">
                              <scopeInfo.icon className="h-2.5 w-2.5" /> {scopeInfo.label}
                            </span>
                          )}
                          {remindText && (
                            <span className="flex items-center gap-0.5 whitespace-nowrap" title="Reminder">
                              <Bell className="h-2.5 w-2.5" /> {remindText}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                      ev.is_completed ? 'bg-sage/10 text-sage-dark'
                        : isToday ? 'bg-rose text-white'
                        : isPast ? 'bg-ink/5 text-ink-muted'
                        : ev.daysLeft <= 7 ? 'bg-rose/10 text-rose'
                        : ev.daysLeft <= 30 ? 'bg-gold/20 text-yellow-700'
                        : 'bg-sage/20 text-sage-dark'
                    }`}>
                      {ev.is_completed ? 'Done' : countdownText(ev.daysLeft)}
                    </span>
                  </div>

                  {/* Ternaries, not &&: a budget of 0 would otherwise print "0" */}
                  {ev.description || ev.location || ev.budget ? (
                    <div className="border-t border-border px-4 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 text-xs text-ink-muted">
                      {ev.location ? (
                        <span className="flex min-w-0 flex-1 items-start gap-1 break-words">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-2">{ev.location}</span>
                        </span>
                      ) : null}
                      {ev.budget ? (
                        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                          <Wallet className="h-3 w-3" />Rp {Number(ev.budget).toLocaleString('id-ID')}
                        </span>
                      ) : null}
                      {ev.description && !ev.location && !ev.budget ? <span className="line-clamp-3 break-words">{ev.description}</span> : null}
                    </div>
                  ) : null}

                  {confirmDeleteId === ev.id ? (
                    <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-red-700">Delete &ldquo;{ev.title}&rdquo;?</p>
                      <p className="mt-0.5 text-xs text-red-600/80">It will be removed from both of your calendars.</p>
                      <div className="mt-2.5 flex gap-2">
                        <button onClick={() => setConfirmDeleteId(null)} disabled={deletingId === ev.id}
                          className="flex-1 rounded-xl border border-border bg-white py-2 text-xs font-semibold text-ink-muted">
                          Cancel
                        </button>
                        <button onClick={() => deleteEvent(ev.id)} disabled={deletingId === ev.id}
                          className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-bold text-white disabled:opacity-60">
                          {deletingId === ev.id ? 'Deleting...' : 'Yes, delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div className="flex items-stretch border-t border-border">
                    {ev.event_type === 'date_plan' && (
                      <>
                        <button onClick={() => toggleComplete(ev)}
                          className="flex-1 py-2 text-xs font-semibold text-sage-dark hover:bg-sage/5">
                          {ev.is_completed ? 'Mark as not done' : 'Mark as done'}
                        </button>
                        <div className="w-px bg-border" />
                      </>
                    )}
                    {canMoment && (
                      <Link href={momentHref(ev, ev.nextDate)}
                        className="flex items-center gap-1 whitespace-nowrap px-3 py-2 text-xs font-semibold text-rose hover:bg-rose/5">
                        <Camera className="h-3.5 w-3.5" /> Save as a Moment
                      </Link>
                    )}
                    <div className="ml-auto flex">
                      <button onClick={() => openEdit(ev)} aria-label={`Edit ${ev.title}`}
                        className="px-3 py-2 text-ink-muted/50 hover:text-rose">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setConfirmDeleteId(ev.id); setListError('') }} aria-label={`Delete ${ev.title}`}
                        className="px-3 py-2 text-ink-muted/30 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== ADD / EDIT EVENT MODAL ===== */}
      <Modal open={modalOpen}
        onClose={() => { setModalOpen(false); if (editingId) resetForm() }}
        title={editingId ? 'Edit event' : 'Add to calendar'}
        className="max-h-[92vh] overflow-y-auto">
        <form onSubmit={saveEvent} className="space-y-4">
          <input type="text" placeholder="Event title" aria-label="Event title" value={newTitle} onChange={e => setNewTitle(e.target.value)} required
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          <input type="date" aria-label="Date" value={newDate} onChange={e => setNewDate(e.target.value)} required
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: 'event', label: 'Event' }, { value: 'reminder', label: 'Reminder' },
                { value: 'date_plan', label: 'Date plan' }, { value: 'birthday', label: 'Birthday' },
                { value: 'anniversary', label: 'Anniversary' }, { value: 'milestone', label: 'Milestone' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setNewType(opt.value)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    newType === opt.value ? 'border-rose bg-rose-50 text-rose' : 'border-border text-ink-muted hover:border-rose'
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">Who&apos;s it for?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: 'couple', label: 'Both of us', icon: Users },
                { value: 'personal', label: 'Me', icon: User },
                { value: 'partner', label: 'My partner', icon: Heart },
              ].map(opt => {
                const ScopeIcon = opt.icon
                return (
                  <button key={opt.value} type="button" onClick={() => setNewScope(opt.value)}
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      newScope === opt.value ? 'border-rose bg-rose-50 text-rose' : 'border-border text-ink-muted hover:border-rose'
                    }`}>
                    <ScopeIcon className="h-3 w-3" /> {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <input type="text" placeholder="Notes (optional)" aria-label="Notes" value={newDescription} onChange={e => setNewDescription(e.target.value)}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          {OUTING_TYPES.includes(newType) && (
            <>
              <input type="text" placeholder="Location (optional)" aria-label="Location" value={newLocation} onChange={e => setNewLocation(e.target.value)}
                className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Rp</span>
                <input type="text" inputMode="numeric" placeholder="Budget (optional)" aria-label="Budget" value={newBudget}
                  onChange={e => { const n = e.target.value.replace(/\D/g, ''); setNewBudget(n ? parseInt(n,10).toLocaleString('id-ID') : '') }}
                  className="w-full rounded-2xl border border-border bg-white py-3 pl-9 pr-4 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
              </div>
            </>
          )}
          <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <input type="checkbox" checked={newRecurring} onChange={e => setNewRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-border text-rose focus:ring-rose" />
            <span className="text-sm text-ink">Repeats every year</span>
          </label>
          <RemindPicker value={newRemind} onChange={setNewRemind} />
          {formError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
          <Button type="submit" loading={saving} size="lg">{editingId ? 'Save changes' : 'Save'}</Button>
        </form>
      </Modal>

      {/* ===== DATE PLAN FROM IDEA MODAL ===== */}
      <Modal open={datePlanModal} onClose={() => { setDatePlanModal(false); resetForm() }} title="Plan a date">
        <form onSubmit={saveEvent} className="space-y-4">
          <div className="rounded-xl bg-purple-50 p-3">
            <p className="text-sm font-bold text-purple-700">{newTitle}</p>
            <p className="text-xs text-purple-600/70">{newDescription}</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">When?</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          </div>
          <input type="text" placeholder="Location (optional)" aria-label="Location" value={newLocation} onChange={e => setNewLocation(e.target.value)}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          <RemindPicker value={newRemind} onChange={setNewRemind} />
          {formError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
          <Button type="submit" loading={saving} size="lg">Save date plan</Button>
        </form>
      </Modal>
    </div>
  )
}
