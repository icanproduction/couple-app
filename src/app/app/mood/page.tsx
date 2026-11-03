'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import MoodCheckinCard from '@/components/app/MoodCheckinCard'
import { createClient } from '@/lib/supabase'
import { formatDateID, formatDateShortID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import { countMoods, dateRange, listCheckins, moodInfo, shiftDate, type MoodCheckin } from '@/lib/mood'
import { cn } from '@/lib/utils'

const HISTORY_DAYS = 14
const COUNT_DAYS = 30

interface Person {
  id: string
  name: string
}

export default function MoodPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nocouple' | 'error'>('loading')
  const [rows, setRows] = useState<MoodCheckin[]>([])
  const [today, setToday] = useState(() => todayJakarta())
  const [selected, setSelected] = useState<{ personId: string; date: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

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

  const loadHistory = useCallback(async () => {
    if (!info?.coupleId) return
    try {
      const t = todayJakarta()
      const list = await listCheckins(createClient(), info.coupleId, shiftDate(t, -(COUNT_DAYS - 1)))
      setToday(t)
      setRows(list)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [info])

  useEffect(() => { loadHistory() }, [loadHistory])
  useCoupleRealtime(info?.coupleId, ['mood_checkins'], loadHistory)
  // Left open past midnight: move the history on to the new Jakarta day
  useEffect(() => {
    const timer = setInterval(() => { if (todayJakarta() !== today) loadHistory() }, 60_000)
    return () => clearInterval(timer)
  }, [today, loadHistory])

  const people: Person[] = useMemo(() => {
    if (!info) return []
    const list: Person[] = [{ id: info.userId, name: 'Kamu' }]
    if (info.partnerId) list.push({ id: info.partnerId, name: info.names[info.partnerId] ?? 'Pasangan' })
    return list
  }, [info])

  const byKey = useMemo(() => {
    const map = new Map<string, MoodCheckin>()
    for (const r of rows) map.set(`${r.profile_id}|${r.checkin_date}`, r)
    return map
  }, [rows])

  const days = dateRange(today, HISTORY_DAYS)
  const partnerName = info?.partnerId ? info.names[info.partnerId] ?? null : null
  const selectedRow = selected ? byKey.get(`${selected.personId}|${selected.date}`) ?? null : null
  const selectedPerson = selected ? people.find((p) => p.id === selected.personId) : null
  const selectedMood = moodInfo(selectedRow?.mood)

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/jelajah" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Jelajah
        </Link>
        <h1 className="text-xl font-bold text-ink">Mood Harian</h1>
        <p className="text-sm text-ink-muted">Saling tahu perasaan masing-masing, tiap hari</p>
      </div>

      {status === 'loading' ? (
        <div className="space-y-4 px-6 pt-5">
          <div className="h-48 animate-pulse rounded-2xl bg-rose-50" />
          <div className="h-32 animate-pulse rounded-2xl bg-rose-50" />
        </div>
      ) : status === 'nocouple' ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Hubungkan akunmu dengan pasangan dulu untuk mulai check-in mood.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Profil</Link>
        </div>
      ) : status === 'error' && rows.length === 0 ? (
        <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-sm text-red-600">Gagal memuat riwayat mood.</p>
          <button
            onClick={() => { setStatus('loading'); if (info) loadHistory(); else setAttempt((n) => n + 1) }}
            className="flex items-center gap-1 text-xs font-semibold text-red-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </button>
        </div>
      ) : info ? (
        <div className="space-y-5 pt-5">
          {/* Today, both partners */}
          <MoodCheckinCard
            coupleId={info.coupleId}
            userId={info.userId}
            partnerId={info.partnerId}
            partnerName={partnerName}
            hideHistoryLink
            onSaved={loadHistory}
          />

          {/* 14-day grid */}
          <section className="mx-6 rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-ink">{HISTORY_DAYS} Hari Terakhir</h2>
              <p className="text-[11px] text-ink-muted">
                {formatDateShortID(days[0])} – {formatDateShortID(days[days.length - 1])}
              </p>
            </div>

            <div
              className="grid items-center gap-x-0.5 gap-y-1.5"
              style={{ gridTemplateColumns: `3.25rem repeat(${HISTORY_DAYS}, minmax(0, 1fr))` }}
            >
              <span />
              {days.map((d) => (
                <span
                  key={d}
                  className={cn(
                    'text-center text-[9px] font-semibold',
                    d === today ? 'text-rose' : 'text-ink-muted/70'
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              ))}

              {people.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  days={days}
                  byKey={byKey}
                  selected={selected}
                  onSelect={(date) => setSelected((s) => (s?.personId === p.id && s.date === date ? null : { personId: p.id, date }))}
                />
              ))}
            </div>

            {!info.partnerId && (
              <p className="mt-3 text-xs text-ink-muted">Pasanganmu belum bergabung, jadi baru mood-mu yang tercatat.</p>
            )}

            {selected && selectedPerson && (
              <div className="mt-3 animate-fade-in rounded-xl bg-cream px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {selectedPerson.name} · {formatDateID(selected.date)}
                </p>
                {selectedMood && selectedRow ? (
                  <>
                    <p className="mt-1 text-sm text-ink">
                      <span aria-hidden>{selectedMood.emoji}</span>{' '}
                      <span className="font-bold" style={{ color: selectedMood.color }}>{selectedMood.label}</span>
                    </p>
                    {selectedRow.note && <p className="mt-0.5 break-words text-xs italic text-ink-light">“{selectedRow.note}”</p>}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">Belum check-in hari itu</p>
                )}
              </div>
            )}
            {!selected && <p className="mt-3 text-[11px] text-ink-muted">Ketuk kotak untuk lihat detail &amp; catatannya.</p>}
          </section>

          {/* 30-day counts */}
          <section className="mx-6 rounded-2xl border border-border bg-white p-4 shadow-card">
            <h2 className="text-sm font-bold text-ink">{COUNT_DAYS} Hari Terakhir</h2>
            <p className="mb-3 text-[11px] text-ink-muted">Mood yang paling sering muncul</p>
            <div className="space-y-4">
              {people.map((p) => {
                const mine = rows.filter((r) => r.profile_id === p.id)
                const counts = countMoods(mine)
                const max = counts[0]?.count ?? 0
                return (
                  <div key={p.id}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <p className="text-xs font-bold text-ink">{p.name}</p>
                      <p className="text-[11px] text-ink-muted">{mine.length} dari {COUNT_DAYS} hari check-in</p>
                    </div>
                    {counts.length === 0 ? (
                      <p className="rounded-xl bg-cream px-3 py-2 text-xs text-ink-muted">Belum ada check-in.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {counts.map(({ mood, count }) => (
                          <li key={mood.key} className="flex items-center gap-2">
                            <span className="w-5 text-center text-base leading-none" aria-hidden>{mood.emoji}</span>
                            <span className="w-16 shrink-0 text-xs text-ink-light">{mood.label}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.max(8, (count / max) * 100)}%`, backgroundColor: mood.color }}
                              />
                            </div>
                            <span className="w-6 text-right text-xs font-bold text-ink">{count}×</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function PersonRow({
  person, days, byKey, selected, onSelect,
}: {
  person: Person
  days: string[]
  byKey: Map<string, MoodCheckin>
  selected: { personId: string; date: string } | null
  onSelect: (date: string) => void
}) {
  return (
    <>
      <span className="truncate pr-1 text-[11px] font-semibold text-ink-light" title={person.name}>{person.name}</span>
      {days.map((d) => {
        const row = byKey.get(`${person.id}|${d}`)
        const mood = moodInfo(row?.mood)
        const active = selected?.personId === person.id && selected.date === d
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={`${person.name}, ${formatDateID(d)}: ${mood ? mood.label : 'belum check-in'}`}
            aria-pressed={active}
            className={cn(
              'flex aspect-square w-full items-center justify-center rounded-md text-[13px] leading-none transition-transform active:scale-90',
              active && 'ring-2 ring-rose ring-offset-1',
              !mood && 'bg-cream'
            )}
            style={mood ? { backgroundColor: mood.soft } : undefined}
          >
            {mood ? <span aria-hidden>{mood.emoji}</span> : <span className="h-1 w-1 rounded-full bg-border" aria-hidden />}
          </button>
        )
      })}
    </>
  )
}
