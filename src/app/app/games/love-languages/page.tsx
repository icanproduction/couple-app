'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BellRing, Check, Heart, Lightbulb, RefreshCw, RotateCcw, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  LOVE_KEYS, LOVE_LANGUAGES, QUESTION_COUNT, differenceLine, pickTips, rankKeys, type LoveKey,
} from '@/components/games/love-languages/bank'
import { loadResults, pushPartner, saveResult, useLiveResults, type LoveResult } from '@/components/games/love-languages/results-api'
import { loadLoveCouple, type LoveCouple } from '@/components/games/love-languages/couple'
import { CompareBars, LoveIcon, ScoreBars } from '@/components/games/love-languages/Bars'
import { LlQuiz } from '@/components/games/love-languages/LlQuiz'

type Status = 'loading' | 'nocouple' | 'error' | 'ready'
type NudgeState = 'idle' | 'sending' | 'sent' | 'muted' | 'failed'

function jakartaDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** One nudge per person per Jakarta day, remembered on this device. */
function nudgeKey(userId: string): string {
  return 'nk:love-languages:nudged:' + userId
}

function nudgedToday(userId: string): boolean {
  try {
    return localStorage.getItem(nudgeKey(userId)) === jakartaDay()
  } catch {
    return false
  }
}

function rememberNudge(userId: string) {
  try {
    localStorage.setItem(nudgeKey(userId), jakartaDay())
  } catch {
    // Storage blocked: the button simply stays available.
  }
}

export default function LoveLanguagesPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const [couple, setCouple] = useState<LoveCouple | null>(null)
  const [results, setResults] = useState<Record<string, LoveResult>>({})
  const [quizOpen, setQuizOpen] = useState(false)
  const [confirmRetake, setConfirmRetake] = useState(false)
  const [nudge, setNudge] = useState<NudgeState>('idle')
  const [tipPage, setTipPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      const res = await loadLoveCouple()
      if (cancelled) return
      if (res.status === 'signedout') { router.replace('/auth/login'); return }
      if (res.status === 'nocouple') { setStatus('nocouple'); return }
      const ids = [res.couple.userId, ...(res.couple.partnerId ? [res.couple.partnerId] : [])]
      const loaded = await loadResults(res.couple.coupleId, ids)
      if (cancelled) return
      setCouple(res.couple)
      setResults(loaded)
      setNudge(nudgedToday(res.couple.userId) ? 'sent' : 'idle')
      setStatus('ready')
    })().catch((err) => {
      console.error('[love-languages] load failed:', err)
      if (!cancelled) setStatus('error')
    })
    return () => { cancelled = true }
  }, [router, attempt])

  // Live: the partner finishing (or retaking) updates this screen by itself.
  // A refresh that started before my own save finished is dropped, so it
  // can't put my old result back on screen.
  const saveGeneration = useRef(0)
  const refresh = useCallback(async () => {
    if (!couple) return
    const generation = saveGeneration.current
    try {
      const ids = [couple.userId, ...(couple.partnerId ? [couple.partnerId] : [])]
      const fresh = await loadResults(couple.coupleId, ids)
      if (generation === saveGeneration.current) setResults(fresh)
    } catch {
      // Keep what's on screen; the next event or visit tries again.
    }
  }, [couple])
  useLiveResults(status === 'ready' && couple ? couple.coupleId : null, refresh)

  const mine = couple ? results[couple.userId] ?? null : null
  const theirs = couple?.partnerId ? results[couple.partnerId] ?? null : null
  // A real name is used as written; only the fallback changes case at the start of a sentence.
  const partner = couple?.partnerName ?? 'your partner'
  const Partner = couple?.partnerName ?? 'Your partner'

  // New tips whenever the partner's result changes.
  const tipSeed = theirs ? theirs.taken_at : ''
  useEffect(() => { setTipPage(0) }, [tipSeed])

  const onSave = useCallback(async (answers: number[]) => {
    if (!couple) throw new Error('No couple')
    const firstTime = !results[couple.userId]
    const saved = await saveResult({ userId: couple.userId, coupleId: couple.coupleId, answers })
    saveGeneration.current += 1
    setResults((prev) => ({ ...prev, [couple.userId]: saved }))
    setQuizOpen(false)
    window.scrollTo({ top: 0 })
    if (couple.partnerId) {
      const me = couple.myName ?? 'Your partner'
      const partnerDone = !!results[couple.partnerId]
      const body = !firstTime
        ? `${me} retook the Love Languages quiz. See what changed.`
        : partnerDone
          ? `${me} took the Love Languages quiz. See how you two compare.`
          : `${me} took the Love Languages quiz. Your turn, whenever you're ready.`
      void pushPartner(couple.partnerId, body)
    }
  }, [couple, results])

  async function sendNudge() {
    if (!couple?.partnerId || (nudge !== 'idle' && nudge !== 'failed')) return
    // Another tab may have nudged already today.
    if (nudgedToday(couple.userId)) { setNudge('sent'); return }
    setNudge('sending')
    const me = couple.myName ?? 'Your partner'
    const res = await pushPartner(couple.partnerId, `${me} took the Love Languages quiz and is waiting to compare with you.`)
    if (!res) { setNudge('failed'); return }
    rememberNudge(couple.userId)
    setNudge(res.sent > 0 ? 'sent' : 'muted')
  }

  function startQuiz() {
    setConfirmRetake(false)
    setQuizOpen(true)
  }

  // ------------------------------------------------------------------ render

  const header = (
    <div className="border-b border-border bg-white px-6 py-5">
      <button
        type="button"
        onClick={() => router.push('/app/games')}
        className="-ml-1 mb-3 flex min-h-[32px] items-center gap-1 rounded-lg px-1 text-sm text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
      >
        <ArrowLeft className="h-4 w-4" /> Games
      </button>
      <h1 className="text-xl font-bold text-ink">Love Languages</h1>
      <p className="text-sm text-ink-muted">How each of you feels loved</p>
    </div>
  )

  if (status === 'loading') {
    return (
      <div className="pb-6" aria-busy="true">
        {header}
        <div className="space-y-3 px-6 pt-5">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="pb-6">
        {header}
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Couldn&apos;t load your results. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-semibold text-rose"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    )
  }

  if (status === 'nocouple' || !couple) {
    return (
      <div className="pb-6">
        {header}
        <div className="px-8 pt-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/20 text-sage-dark">
            <Users className="h-6 w-6" />
          </div>
          <p className="mt-4 text-base font-bold text-ink">Connect with your partner first</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">Love Languages compares the two of you. Link your accounts, then come back.</p>
          <Link href="/app/profile" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-rose px-6 text-sm font-semibold text-white shadow-elevated active:scale-[0.98]">
            Go to Profile
          </Link>
        </div>
      </div>
    )
  }

  const closed = couple.closed
  const hasPartner = !!couple.partnerId
  const myTop = mine ? rankKeys(mine.scores).slice(0, 2) : []
  const theirTop = theirs ? rankKeys(theirs.scores).slice(0, 2) : []

  return (
    <div className="pb-6">
      {header}

      <div className="space-y-5 px-6 pt-5">
        {!mine && (
          <>
            <section className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
              <div className="flex justify-center gap-2 bg-cream/60 px-5 py-5" aria-hidden>
                {LOVE_KEYS.map((key) => <LoveIcon key={key} lang={key} />)}
              </div>
              <div className="px-5 pb-5 pt-4">
                <h2 className="text-lg font-bold text-ink">What makes you feel loved?</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {QUESTION_COUNT} quick choices, about three minutes. Each time, pick the one that would mean more to you. {hasPartner ? Partner : 'Your partner'} sees your scores, never your individual answers.
                </p>
                <div className="mt-4">
                  {closed ? (
                    <p className="rounded-2xl bg-cream p-3 text-xs leading-relaxed text-ink-light">
                      This couple is closed, so the quiz is off here. Results start fresh in a new couple.
                    </p>
                  ) : (
                    <Button size="lg" onClick={startQuiz}>
                      <Heart className="h-4 w-4" /> Start the quiz
                    </Button>
                  )}
                </div>
                {!closed && (
                  <p className="mt-3 text-center text-xs text-ink-muted">
                    {!hasPartner
                      ? 'Once your partner joins, you can compare results.'
                      : theirs
                        ? `${Partner} already took it. Finish yours to compare.`
                        : `${Partner} hasn't taken it yet.`}
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="ll-five">
              <h2 id="ll-five" className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">The five</h2>
              <ul className="space-y-2">
                {LOVE_KEYS.map((key) => (
                  <li key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3">
                    <LoveIcon lang={key} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{LOVE_LANGUAGES[key].name}</p>
                      <p className="text-xs text-ink-muted">{LOVE_LANGUAGES[key].short}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {mine && !theirs && (
          <>
            <section className="rounded-3xl border border-border bg-white p-5 shadow-card">
              <h2 className="text-lg font-bold text-ink">Your love languages</h2>
              <p className="mt-0.5 text-xs text-ink-muted">Out of {QUESTION_COUNT} choices</p>
              <div className="mt-4">
                <ScoreBars scores={mine.scores} />
              </div>
            </section>

            <TopTwo keys={myTop} title="What fills you up" />

            {closed ? (
              <p className="rounded-2xl bg-cream p-4 text-xs leading-relaxed text-ink-light">
                This couple is closed. Your result stays here, but it can&apos;t be retaken in this couple.
              </p>
            ) : !hasPartner ? (
              <section className="rounded-2xl border border-dashed border-border bg-white p-5 text-center">
                <p className="text-sm font-bold text-ink">Compare with your partner</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">Share your invite code. Once they join and take the quiz, you&apos;ll both get tips for each other.</p>
                <Link href="/app/profile" className="mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-rose">
                  Share invite code
                </Link>
              </section>
            ) : (
              <section className="rounded-2xl border border-border bg-white p-5 text-center" aria-live="polite">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-rose" />
                  </span>
                </div>
                <p className="mt-3 text-base font-bold text-ink">Waiting for {partner}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  You&apos;ll see how you compare, plus tips for loving each other, as soon as {partner} finishes.
                </p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    onClick={sendNudge}
                    loading={nudge === 'sending'}
                    disabled={nudge === 'sent' || nudge === 'muted'}
                  >
                    {nudge === 'sent' || nudge === 'muted' ? <Check className="h-4 w-4" /> : nudge !== 'sending' && <BellRing className="h-4 w-4" />}
                    {nudge === 'sent' || nudge === 'muted' ? 'Nudged today' : `Nudge ${partner}`}
                  </Button>
                </div>
                <p className="mt-2 min-h-[1rem] text-[11px] text-ink-muted" role="status">
                  {nudge === 'muted'
                    ? `${Partner} has notifications off, so tell them in person.`
                    : nudge === 'failed'
                      ? "Couldn't send the nudge. Try again in a bit."
                      : nudge === 'sent'
                        ? 'One nudge a day. You can send another tomorrow.'
                        : ''}
                </p>
              </section>
            )}
          </>
        )}

        {mine && theirs && (
          <>
            <section className="rounded-3xl border border-border bg-white p-5 shadow-card">
              <div className="grid grid-cols-2 gap-3">
                <TopBadge label="You" lang={myTop[0]} />
                <TopBadge label={Partner} lang={theirTop[0]} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <CompareBars mine={mine.scores} theirs={theirs.scores} partnerName={Partner} />
              </div>
            </section>

            <p className="rounded-2xl bg-cream p-4 text-sm leading-relaxed text-ink-light">
              {differenceLine(mine.scores, theirs.scores, Partner)}
            </p>

            <section aria-labelledby="ll-how">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="ll-how" className="min-w-0 truncate text-base font-bold text-ink">How to love {Partner}</h2>
                <button
                  type="button"
                  onClick={() => setTipPage((p) => p + 1)}
                  className="flex min-h-[36px] flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                >
                  <Lightbulb className="h-3.5 w-3.5" /> More ideas
                </button>
              </div>
              <div className="space-y-3">
                {theirTop.map((key) => (
                  <TipCard key={key} lang={key} tips={pickTips(key, `${theirs.profile_id}:${theirs.taken_at}`, tipPage)} />
                ))}
              </div>
            </section>

            <TopTwo keys={myTop} title="What fills you up" note={`${Partner} sees tips for these on their phone.`} />
          </>
        )}

        {mine && !closed && (
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => setConfirmRetake(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              <RotateCcw className="h-4 w-4" /> Retake the quiz
            </button>
          </div>
        )}
      </div>

      <Modal open={confirmRetake} onClose={() => setConfirmRetake(false)} title="Retake the quiz?">
        <p className="text-sm leading-relaxed text-ink-muted">
          Your new answers replace this result{hasPartner ? `, and ${partner} will see the update` : ''}.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmRetake(false)}>Cancel</Button>
          <Button onClick={startQuiz}>Retake</Button>
        </div>
      </Modal>

      {quizOpen && !closed && <LlQuiz onClose={() => setQuizOpen(false)} onSave={onSave} />}
    </div>
  )
}

function TopBadge({ label, lang }: { label: string; lang: LoveKey | undefined }) {
  if (!lang) return null
  const info = LOVE_LANGUAGES[lang]
  return (
    <div className="min-w-0 rounded-2xl p-3" style={{ backgroundColor: info.soft }}>
      <p className="truncate text-[11px] font-semibold text-ink-muted">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <LoveIcon lang={lang} size="sm" />
        <p className="min-w-0 text-sm font-bold leading-tight" style={{ color: info.color }}>{info.name}</p>
      </div>
    </div>
  )
}

function TopTwo({ keys, title, note }: { keys: LoveKey[]; title: string; note?: string }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-ink">{title}</h2>
      <div className="space-y-3">
        {keys.map((key, i) => {
          const info = LOVE_LANGUAGES[key]
          return (
            <div key={key} className="flex gap-3 rounded-2xl border border-border bg-white p-4">
              <LoveIcon lang={key} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: info.color }}>Top {i + 1}</p>
                <p className="text-sm font-bold text-ink">{info.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{info.description}</p>
              </div>
            </div>
          )
        })}
      </div>
      {note && <p className="mt-2 text-[11px] text-ink-muted">{note}</p>}
    </section>
  )
}

function TipCard({ lang, tips }: { lang: LoveKey; tips: string[] }) {
  const info = LOVE_LANGUAGES[lang]
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center gap-2.5">
        <LoveIcon lang={lang} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{info.name}</p>
          <p className="text-[11px] text-ink-muted">{info.short}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-ink-light motion-safe:animate-fade-in">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
