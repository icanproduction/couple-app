'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Lightbulb, MapPin, Sparkles, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import { todayJakarta } from '@/lib/dates'
import { relativeTimeID } from '@/lib/activity'
import { cn, formatRupiah } from '@/lib/utils'
import {
  BUDGETS,
  BUDGET_LABELS,
  CATEGORY_LABELS,
  CITY_MAX,
  DATE_IDEA_DAILY_LIMIT,
  SETTINGS,
  SETTING_LABELS,
  VIBES,
  VIBE_LABELS,
  cleanCity,
  readStoredIdeas,
  readStoredInput,
  type Budget,
  type DateIdea,
  type DateIdeaInput,
  type Setting,
  type Vibe,
} from './options'

interface Run {
  id: string
  created_at: string
  status: string
  profile_id: string | null
  input: DateIdeaInput | null
  ideas: DateIdea[]
}

const titleKey = (title: string) => title.trim().toLowerCase()

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.97]',
        active ? 'border-rose bg-rose text-white shadow-card' : 'border-border bg-white text-ink-light hover:border-rose-light',
      )}
    >
      {children}
    </button>
  )
}

function costLabel(cost: number): string {
  return cost === 0 ? 'Free' : `About ${formatRupiah(cost)} for two`
}

function IdeaCard({ idea, saved, saving, onSave, compact = false }: {
  idea: DateIdea
  saved: boolean
  saving: boolean
  onSave: () => void
  compact?: boolean
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-white shadow-card', compact ? 'p-3.5' : 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn('font-bold text-ink', compact ? 'text-sm' : 'text-base')}>{idea.title}</p>
        <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose">
          {CATEGORY_LABELS[idea.category]}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-light">{idea.description}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Wallet className="h-3.5 w-3.5 text-gold-dark" /> {costLabel(idea.estimated_cost_idr)}
      </p>
      {!compact && (
        <p className="mt-2 flex gap-1.5 rounded-xl bg-cream px-3 py-2 text-xs leading-relaxed text-ink-light">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-dark" /> {idea.tips}
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saved || saving}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-[0.98]',
          saved ? 'bg-sage/15 text-sage-dark' : 'bg-rose/10 text-rose hover:bg-rose/15',
          saving && 'opacity-60',
        )}
      >
        {saved ? <><Check className="h-4 w-4" /> Saved to Bucket List</> : saving ? 'Saving…' : 'Save to Bucket List'}
      </button>
    </div>
  )
}

function inputSummary(input: DateIdeaInput | null): string {
  if (!input) return 'Date idea'
  return [
    BUDGET_LABELS[input.budget].label,
    VIBE_LABELS[input.vibe],
    SETTING_LABELS[input.setting],
    input.city,
  ].filter(Boolean).join(' · ')
}

export default function IdeDatePage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [runs, setRuns] = useState<Run[]>([])
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set())

  const [budget, setBudget] = useState<Budget>('hemat')
  const [vibe, setVibe] = useState<Vibe>('santai')
  const [setting, setSetting] = useState<Setting>('bebas')
  const [city, setCity] = useState('')
  const [cityError, setCityError] = useState('')

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [currentId, setCurrentId] = useState<string | null>(null)
  // The API answer, shown even if re-reading the history fails.
  const [latest, setLatest] = useState<{ id: string; ideas: DateIdea[] } | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(null)

  const coupleId = info?.coupleId ?? null

  const loadRuns = useCallback(async (cid: string) => {
    const { data, error: e } = await createClient()
      .from('ai_date_idea_runs')
      .select('id, created_at, status, profile_id, input, ideas')
      .eq('couple_id', cid)
      .order('created_at', { ascending: false })
      .limit(20)
    if (e) throw e
    setRuns((data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      status: r.status,
      profile_id: r.profile_id,
      input: readStoredInput(r.input),
      ideas: readStoredIdeas(r.ideas),
    })))
  }, [])

  const loadSaved = useCallback(async (cid: string) => {
    const { data, error: e } = await createClient().from('bucket_items').select('title').eq('couple_id', cid)
    if (e) throw e
    setSavedTitles(new Set((data ?? []).map((b) => titleKey(b.title))))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const i = await getCoupleInfo()
        if (!i) { router.replace('/auth/login'); return }
        if (cancelled) return
        setInfo(i)
        if (i.coupleId) await Promise.all([loadRuns(i.coupleId), loadSaved(i.coupleId)])
      } catch {
        if (!cancelled) setLoadError("Couldn't load this page. Try reopening it.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router, loadRuns, loadSaved])

  // The partner may save an idea (or add the same title) at the same time.
  useCoupleRealtime(coupleId, ['bucket_items'], () => { if (coupleId) loadSaved(coupleId).catch(() => {}) })

  const dayStart = Date.parse(`${todayJakarta()}T00:00:00+07:00`)
  const usedToday = runs.filter((r) => r.status !== 'failed' && Date.parse(r.created_at) >= dayStart).length
  const remaining = Math.max(0, DATE_IDEA_DAILY_LIMIT - usedToday)

  const current = runs.find((r) => r.id === currentId) ?? (latest && latest.id === currentId ? latest : null)
  const history = runs.filter((r) => r.status === 'done' && r.id !== currentId && r.ideas.length > 0).slice(0, 10)

  async function generate() {
    setError('')
    setSaveError('')
    const cleaned = cleanCity(city)
    if (!cleaned.ok) { setCityError(cleaned.error); return }
    setCityError('')
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/date-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, vibe, setting, city: cleaned.city }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : "Couldn't come up with ideas. Try again.")
      } else if (typeof json.runId === 'string') {
        setCurrentId(json.runId)
        setLatest({ id: json.runId, ideas: readStoredIdeas(json.ideas) })
      }
      if (coupleId) await loadRuns(coupleId).catch(() => {})
    } catch {
      setError('Connection problem. Try again in a moment.')
    } finally {
      setGenerating(false)
    }
  }

  async function save(idea: DateIdea, key: string) {
    if (!info?.coupleId) return
    setSaveError('')
    setSavingKey(key)
    try {
      const { error: e } = await createClient().from('bucket_items').insert({
        couple_id: info.coupleId,
        created_by: info.userId,
        title: idea.title,
        note: idea.description,
        category: idea.category,
        source: 'ai',
        estimated_cost: idea.estimated_cost_idr,
      })
      if (e) throw e
      setSavedTitles((prev) => new Set(prev).add(titleKey(idea.title)))
    } catch {
      setSaveError("Couldn't save to your bucket list. Try again.")
    } finally {
      setSavingKey(null)
    }
  }

  const author = (r: Run) => (r.profile_id === info?.userId ? 'You' : r.profile_id ? info?.names[r.profile_id] ?? 'Partner' : 'Partner')

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Date Ideas</h1>
            <p className="text-sm text-ink-muted">Not sure where to go? Let AI suggest a few.</p>
          </div>
          {!loading && coupleId && (
            <span className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold',
              remaining > 0 ? 'bg-rose-50 text-rose' : 'bg-border/60 text-ink-muted',
            )}>
              {remaining}/{DATE_IDEA_DAILY_LIMIT} left today
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 px-6 pt-5">
          <div className="h-64 animate-pulse rounded-2xl bg-rose-50" />
          <div className="h-32 animate-pulse rounded-2xl bg-rose-50" />
        </div>
      ) : loadError ? (
        <p className="mx-6 mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>
      ) : !coupleId ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Connect with your partner first to get date ideas.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : (
        <div className="space-y-6 px-6 pt-5">
          <section className="space-y-4 rounded-2xl border border-border bg-white p-4 shadow-card">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Budget</p>
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((b) => (
                  <Chip key={b} active={budget === b} onClick={() => setBudget(b)}>
                    {BUDGET_LABELS[b].label} <span className={cn('font-normal', budget === b ? 'text-white/80' : 'text-ink-muted')}>{BUDGET_LABELS[b].hint}</span>
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Vibe</p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Chip key={v} active={vibe === v} onClick={() => setVibe(v)}>{VIBE_LABELS[v]}</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Setting</p>
              <div className="flex flex-wrap gap-2">
                {SETTINGS.map((s) => (
                  <Chip key={s} active={setting === s} onClick={() => setSetting(s)}>{SETTING_LABELS[s]}</Chip>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="ide-date-city" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                City <span className="normal-case tracking-normal text-ink-muted/80">(optional)</span>
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose" />
                <input
                  id="ide-date-city"
                  value={city}
                  maxLength={CITY_MAX}
                  onChange={(e) => { setCity(e.target.value); setCityError('') }}
                  placeholder="e.g. Bandung"
                  className="w-full rounded-xl border border-border bg-cream/50 py-3 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-rose focus:outline-none"
                />
              </div>
              {cityError && <p className="mt-1.5 text-xs text-red-600">{cityError}</p>}
            </div>
            <Button onClick={generate} loading={generating} disabled={remaining === 0}>
              {!generating && <Sparkles className="h-4 w-4" />}
              {generating ? 'Thinking of ideas…' : remaining === 0 ? 'No more tries today' : 'Get ideas'}
            </Button>
            {remaining === 0 && !generating && (
              <p className="text-center text-xs text-ink-muted">You&apos;ve used all {DATE_IDEA_DAILY_LIMIT} tries for today. Come back tomorrow.</p>
            )}
          </section>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {saveError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}

          {generating ? (
            <section aria-busy="true" className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Getting 3 ideas ready…</p>
              {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-rose-50" />)}
            </section>
          ) : current && current.ideas.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Ideas for you two</p>
                <Link href="/app/bucket-list" className="text-xs font-semibold text-rose">Open Bucket List</Link>
              </div>
              {current.ideas.map((idea, i) => {
                const key = `${current.id}:${i}`
                return (
                  <IdeaCard
                    key={key}
                    idea={idea}
                    saved={savedTitles.has(titleKey(idea.title))}
                    saving={savingKey === key}
                    onSave={() => save(idea, key)}
                  />
                )
              })}
            </section>
          ) : null}

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Earlier ideas</p>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white/60 px-4 py-6 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-rose/50" />
                <p className="mt-2 text-sm text-ink-muted">No earlier ideas yet. Pick what you&apos;re in the mood for, then tap &ldquo;Get ideas&rdquo;.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((r) => {
                  const open = openRun === r.id
                  return (
                    <div key={r.id} className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
                      <button
                        type="button"
                        onClick={() => setOpenRun(open ? null : r.id)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{inputSummary(r.input)}</p>
                          <p className="truncate text-xs text-ink-muted">
                            {author(r)} · {relativeTimeID(r.created_at)} · {r.ideas.map((i) => i.title).join(', ')}
                          </p>
                        </div>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />
                      </button>
                      {open && (
                        <div className="space-y-2.5 border-t border-border bg-cream/40 p-3">
                          {r.ideas.map((idea, i) => {
                            const key = `${r.id}:${i}`
                            return (
                              <IdeaCard
                                key={key}
                                compact
                                idea={idea}
                                saved={savedTitles.has(titleKey(idea.title))}
                                saving={savingKey === key}
                                onSave={() => save(idea, key)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
