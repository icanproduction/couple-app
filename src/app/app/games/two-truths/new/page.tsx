'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Hourglass, Lightbulb, Lock, Send, Shuffle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, NoPartnerCard, StateCard } from '@/components/games/two-truths/StateCard'
import { useTwoTruths } from '@/components/games/two-truths/useTwoTruths'
import { createRound, pushPartner, TwoTruthsError } from '@/components/games/two-truths/api'
import { EXAMPLE_ROUNDS, STARTERS, TIPS } from '@/components/games/two-truths/ideas'
import {
  GAME_PATH,
  STATEMENT_MAX,
  STORY_MAX,
  cap,
  errorCode,
  errorText,
  groupRounds,
  validateDraft,
  type ErrorCode,
} from '@/components/games/two-truths/logic'

const PLACEHOLDERS = [
  "e.g. I've never been to Bali.",
  'e.g. I once missed a flight because I fell asleep.',
  'e.g. I can whistle with two fingers.',
]

function Header({ partnerName }: { partnerName?: string }) {
  return (
    <GameHeader
      title="Write a round"
      subtitle={partnerName ? `Two truths and one lie about you. ${cap(partnerName)} guesses the lie.` : 'Two truths and one lie about you.'}
      backHref={GAME_PATH}
      backLabel="Two Truths & a Lie"
    />
  )
}

export default function NewRoundPage() {
  const router = useRouter()
  const { state, retry } = useTwoTruths()

  const [statements, setStatements] = useState(['', '', ''])
  const [lie, setLie] = useState<number | null>(null)
  const [exampleOpen, setExampleOpen] = useState(false)
  const [story, setStory] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<{ code: ErrorCode; text: string } | null>(null)
  const [sent, setSent] = useState(false)
  const [active, setActive] = useState(0)
  const [example, setExample] = useState(0)
  const busy = useRef(false)
  const fields = useRef<(HTMLTextAreaElement | null)[]>([])
  const lieGroup = useRef<HTMLDivElement | null>(null)
  const storyField = useRef<HTMLTextAreaElement | null>(null)

  const draft = useMemo(() => ({ statements, lieIndex: lie, story }), [statements, lie, story])
  const problems = useMemo(() => validateDraft(draft), [draft])
  const statementProblem = (i: number) =>
    showProblems ? problems.find((p) => p.field === 'statement' && p.index === i)?.message ?? null : null
  const lieProblem = showProblems ? problems.find((p) => p.field === 'lie')?.message ?? null : null
  const storyProblem = showProblems ? problems.find((p) => p.field === 'story')?.message ?? null : null

  if (state.status === 'loading') return <GameSkeleton cards={3} />
  if (state.status === 'error') {
    return (
      <div className="pb-6">
        <Header />
        <LoadErrorCard message={state.message} onRetry={retry} />
      </div>
    )
  }
  if (state.status === 'no-partner') {
    return (
      <div className="pb-6">
        <Header />
        <NoPartnerCard />
      </div>
    )
  }

  const { ctx, list, partnerName } = state
  const them = cap(partnerName)
  const partner = ctx.partner

  if (sent) {
    return (
      <div className="pb-6">
        <Header partnerName={partnerName} />
        <StateCard
          icon={Send}
          role="status"
          title={`Sent to ${them}`}
          body={`You'll get a notification when ${partnerName} makes a guess. The answer shows up for both of you.`}
        >
          <Button onClick={() => router.replace(GAME_PATH)}>Done</Button>
        </StateCard>
      </div>
    )
  }

  if (ctx.closed || !partner) {
    return (
      <div className="pb-6">
        <Header />
        <StateCard icon={Lock} title="New rounds are off" body={`${them} left this couple space, so there's nobody to guess. Past rounds are still there to look back on.`}>
          <Link href={GAME_PATH} className={buttonVariants({ variant: 'secondary' })}>
            See past rounds
          </Link>
        </StateCard>
      </div>
    )
  }

  const { myOpen } = groupRounds(list.rounds)
  if (myOpen) {
    return (
      <div className="pb-6">
        <Header partnerName={partnerName} />
        <StateCard icon={Hourglass} title="You already have a round out" body={`${them} hasn't guessed it yet. You can send a new one once they do, or cancel the one that's waiting.`}>
          <Link href={`${GAME_PATH}/${myOpen.id}`} className={buttonVariants()}>
            See your round
          </Link>
        </StateCard>
      </div>
    )
  }

  const partnerId = partner.id
  const allFilled = statements.every((s) => s.trim().length > 0)
  const ex = EXAMPLE_ROUNDS[example % EXAMPLE_ROUNDS.length]

  function setStatement(i: number, value: string) {
    setStatements((prev) => prev.map((s, j) => (j === i ? value : s)))
    setSendError(null)
  }

  function insertStarter(starter: string) {
    const target = statements[active].trim() === '' ? active : statements.findIndex((s) => s.trim() === '')
    if (target < 0) return
    const text = `${starter} `
    setStatement(target, text)
    setActive(target)
    requestAnimationFrame(() => {
      const el = fields.current[target]
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  async function send() {
    if (busy.current) return
    if (problems.length) {
      setShowProblems(true)
      const first = problems[0]
      if (first.field === 'statement') fields.current[first.index]?.focus()
      else if (first.field === 'lie') lieGroup.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else if (first.field === 'story') storyField.current?.focus()
      return
    }
    busy.current = true
    setSending(true)
    setSendError(null)
    try {
      await createRound(draft)
      setSent(true)
      pushPartner(partnerId, `${ctx.myName ?? 'Your partner'} sent you two truths and a lie`)
    } catch (e) {
      const code = e instanceof TwoTruthsError ? e.code : errorCode({ message: e instanceof Error ? e.message : null })
      setSendError({ code, text: errorText(code, partnerName, e instanceof Error ? e.message : null) })
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="animate-fade-in pb-6">
      <Header partnerName={partnerName} />

      <form
        className="px-6 pt-5"
        onSubmit={(e) => { e.preventDefault(); void send() }}
        noValidate
      >
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <Lightbulb className="h-4 w-4 text-yellow-700" aria-hidden="true" /> Stuck? Start with one of these
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => insertStarter(s)}
                disabled={allFilled || sending}
                className="rounded-full border border-gold/50 bg-white px-3 py-1.5 text-xs font-semibold text-ink-light transition-colors hover:border-gold-dark active:scale-95 disabled:opacity-40"
              >
                {s}…
              </button>
            ))}
          </div>
        </div>

        <fieldset className="mt-5 space-y-3" disabled={sending}>
          <legend className="sr-only">Your three statements</legend>
          <div ref={lieGroup} className="space-y-3">
            {statements.map((value, i) => {
              const isLie = lie === i
              const problem = statementProblem(i)
              const len = value.trim().length
              return (
                <div
                  key={i}
                  className={cn('rounded-2xl border bg-white p-3 shadow-card transition-colors', {
                    'border-rose ring-2 ring-rose/15': isLie,
                    'border-danger': !isLie && !!problem,
                    'border-border': !isLie && !problem,
                  })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`tt-statement-${i}`} className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      Statement {i + 1}
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="tt-lie"
                        className="peer sr-only"
                        checked={isLie}
                        onChange={() => { setLie(i); setSendError(null) }}
                        aria-label={`Statement ${i + 1} is the lie`}
                      />
                      <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-ink-muted transition-colors peer-checked:border-rose peer-checked:bg-rose peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-rose/40">
                        {isLie ? 'The lie' : 'Mark as lie'}
                      </span>
                    </label>
                  </div>
                  <textarea
                    id={`tt-statement-${i}`}
                    ref={(el) => { fields.current[i] = el }}
                    value={value}
                    onChange={(e) => setStatement(i, e.target.value)}
                    onFocus={() => setActive(i)}
                    maxLength={STATEMENT_MAX}
                    rows={2}
                    placeholder={PLACEHOLDERS[i]}
                    aria-invalid={!!problem}
                    aria-describedby={`tt-statement-${i}-note`}
                    className="mt-2 w-full resize-none rounded-xl bg-cream/60 px-3 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-ink-muted/60 focus:bg-white focus:ring-2 focus:ring-rose/15"
                  />
                  <div id={`tt-statement-${i}-note`} className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className={cn({ 'text-danger': !!problem, 'text-ink-muted': !problem })}>{problem ?? ''}</span>
                    <span className={cn('shrink-0 tabular-nums', { 'text-ink-muted': len <= STATEMENT_MAX - 20, 'text-yellow-700': len > STATEMENT_MAX - 20 })}>
                      {len}/{STATEMENT_MAX}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className={cn('text-xs', { 'font-semibold text-danger': !!lieProblem, 'text-ink-muted': !lieProblem })} role={lieProblem ? 'alert' : undefined}>
            {lieProblem ?? (lie === null ? 'Tap “Mark as lie” on the one you made up.' : `${them} sees all three, in a shuffled order.`)}
          </p>

          <div className="rounded-2xl border border-border bg-white p-3 shadow-card">
            <label htmlFor="tt-story" className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              The story <span className="font-semibold normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id="tt-story"
              ref={storyField}
              value={story}
              onChange={(e) => { setStory(e.target.value); setSendError(null) }}
              maxLength={STORY_MAX}
              rows={3}
              placeholder="What's the real story? Why that lie?"
              aria-invalid={!!storyProblem}
              aria-describedby="tt-story-note"
              className="mt-2 w-full resize-none rounded-xl bg-cream/60 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:bg-white focus:ring-2 focus:ring-rose/15"
            />
            <div id="tt-story-note" className="mt-1 flex items-center justify-between gap-2 text-[11px]">
              <span className={cn({ 'text-danger': !!storyProblem, 'text-ink-muted': !storyProblem })}>
                {storyProblem ?? `${them} only sees this after guessing.`}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">{story.trim().length}/{STORY_MAX}</span>
            </div>
          </div>
        </fieldset>

        {/* State-driven, not <details>: closed content is not rendered at all,
            so it can't sit (invisibly) over the send button or under the nav. */}
        <div className="mt-5 rounded-2xl border border-border bg-white shadow-card">
          <button
            type="button"
            onClick={() => setExampleOpen((o) => !o)}
            aria-expanded={exampleOpen}
            aria-controls="tt-example"
            className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-semibold text-ink"
          >
            See an example round
            <span className="text-xs font-bold text-sky-600">{exampleOpen ? 'Hide' : 'Show'}</span>
          </button>
          {exampleOpen && (
          <div id="tt-example" className="border-t border-border px-4 pb-4 pt-3">
            <ol className="space-y-2">
              {ex.statements.map((s, i) => (
                <li key={`${example}-${i}`} className="flex items-start gap-2 text-sm text-ink-light">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cream text-[11px] font-bold text-ink-light" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {s}
                    {i === ex.lie && (
                      <span className="ml-1.5 inline-block rounded-md border border-rose px-1.5 text-[10px] font-black uppercase tracking-wider text-rose">Lie</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setExample((n) => n + 1)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Show another
            </button>
            <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
              {TIPS.map((t) => (
                <li key={t} className="text-xs leading-relaxed text-ink-muted">{t}</li>
              ))}
            </ul>
          </div>
          )}
        </div>

        {sendError && (
          <div role="alert" className="mt-5 rounded-xl border border-rose/20 bg-rose/5 px-4 py-3 text-xs font-medium text-rose">
            {sendError.text}
            {sendError.code === 'TT_OPEN_ROUND' && (
              <Link href={GAME_PATH} className="ml-1 font-bold underline">See it</Link>
            )}
          </div>
        )}

        <div className="mt-5">
          <Button type="submit" loading={sending}>
            {sending ? 'Sending…' : <><Send className="h-4 w-4" aria-hidden="true" /> Send to {them}</>}
          </Button>
          <p className="mt-2 text-center text-xs text-ink-muted">The order gets shuffled before sending.</p>
        </div>
      </form>
    </div>
  )
}
