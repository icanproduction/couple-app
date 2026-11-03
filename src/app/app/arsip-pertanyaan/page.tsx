'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, ArrowLeft, Flame, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { DAILY_QUESTIONS } from '@/data/dailyQuestions'
import {
  buildAiEntries, buildDailyEntries, computeStreak, groupByMonth, matchesQuery,
  type AiQuestionRow, type ArchiveEntry, type DailyResponseRow,
} from '@/lib/daily-archive'

const PAGE = 1000

export default function ArsipPertanyaanPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nocouple' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [responses, setResponses] = useState<DailyResponseRow[]>([])
  const [aiRows, setAiRows] = useState<AiQuestionRow[]>([])
  const [today, setToday] = useState(() => todayJakarta())
  const [query, setQuery] = useState('')

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
    const client = createClient()
    try {
      // RLS returns my answers + my partner's only on dates I answered too.
      const all: DailyResponseRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from('daily_responses')
          .select('answered_date, profile_id, question_index, answer')
          .eq('couple_id', info.coupleId)
          .order('answered_date', { ascending: false })
          .order('profile_id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data ?? []))
        if ((data ?? []).length < PAGE) break
      }
      const { data: ai, error: aiError } = await client
        .from('ai_daily_questions')
        .select('question_date, question')
        .eq('couple_id', info.coupleId)
        .order('question_date', { ascending: false })
        .limit(PAGE)
      if (aiError) throw aiError
      setToday(todayJakarta())
      setResponses(all)
      setAiRows(ai ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [info])

  useEffect(() => { load() }, [load])

  const daily = useMemo(
    () => (info ? buildDailyEntries(responses, info.userId, (i) => DAILY_QUESTIONS[i]) : []),
    [responses, info]
  )
  const ai = useMemo(() => buildAiEntries(aiRows, today), [aiRows, today])
  const streak = useMemo(() => computeStreak(responses, today), [responses, today])
  const months = useMemo(
    () => groupByMonth([...daily, ...ai].filter((e) => matchesQuery(e, query))),
    [daily, ai, query]
  )

  const bothCount = daily.filter((e) => e.partner !== null).length
  const partnerName = info?.partnerId ? info.names[info.partnerId] ?? 'Partner' : null
  const total = daily.length + ai.length

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/jelajah" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Jelajah
        </Link>
        <h1 className="text-xl font-bold text-ink">Past Answers</h1>
        <p className="text-sm text-ink-muted">Every daily question you&apos;ve answered</p>
      </div>

      {status === 'loading' ? (
        <div className="space-y-3 px-6 pt-5">
          <div className="h-20 animate-pulse rounded-2xl bg-rose-50" />
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : status === 'nocouple' ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Connect with your partner first to start collecting answers.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : status === 'error' ? (
        <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-sm text-red-600">Couldn&apos;t load your answers.</p>
          <button
            onClick={() => { setStatus('loading'); if (info) load(); else setAttempt((n) => n + 1) }}
            className="flex items-center gap-1 text-xs font-semibold text-red-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
            <Archive className="h-8 w-8 text-rose" />
          </div>
          <h2 className="text-lg font-bold text-ink">Nothing here yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Answer today&apos;s question on Home. Every answer you two give gets saved here.
          </p>
          <Link href="/app/home" className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated">
            Go to today&apos;s question
          </Link>
        </div>
      ) : (
        <div className="px-6 pt-5">
          {/* Streak + counts */}
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50">
              <Flame className="h-6 w-6 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-ink">
                {streak > 0 ? `${streak}-day streak` : 'Start a new streak today'}
              </p>
              <p className="text-xs text-ink-muted">
                {daily.length} answered by you{partnerName ? ` · ${bothCount} by both of you` : ''}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions or answers"
              aria-label="Search questions or answers"
              className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-cream"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {months.length === 0 ? (
            <p className="mt-10 text-center text-sm text-ink-muted">Nothing matches “{query.trim()}”.</p>
          ) : (
            <div className="mt-5 space-y-7">
              {months.map((month) => (
                <section key={month.key}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{month.label}</p>
                  <div className="space-y-3">
                    {month.entries.map((entry) => (
                      <EntryCard key={`${entry.type}-${entry.date}`} entry={entry} partnerName={partnerName} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, partnerName }: { entry: ArchiveEntry; partnerName: string | null }) {
  if (entry.type === 'ai') {
    return (
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-rose-50 p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-500">
            <Sparkles className="h-3 w-3" /> AI question
          </span>
          <span className="text-[11px] text-ink-muted">{formatDateID(entry.date)}</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-ink">{entry.question}</p>
        <p className="mt-2 text-[11px] text-ink-muted">Answers to this one aren&apos;t saved. Good one to talk about again.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
      <div className="px-4 pb-3 pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-muted">{formatDateID(entry.date)}</span>
          <span className="text-[11px] text-ink-muted/60">#{entry.questionIndex + 1}</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-ink">{entry.question}</p>
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <div className="rounded-xl rounded-tl-sm bg-rose-50 px-3 py-2">
          <p className="text-xs font-semibold text-rose">You</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{entry.mine}</p>
        </div>
        {entry.partner !== null ? (
          <div className="rounded-xl rounded-tl-sm bg-sage/10 px-3 py-2">
            <p className="text-xs font-semibold text-sage-dark">{partnerName ?? 'Partner'}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{entry.partner}</p>
          </div>
        ) : (
          <p className="rounded-xl bg-cream px-3 py-2 text-xs text-ink-muted">{partnerName ?? 'Your partner'} hasn&apos;t answered yet</p>
        )}
      </div>
    </div>
  )
}
