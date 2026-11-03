'use client'

import Link from 'next/link'
import { ChevronRight, Hourglass, Lock, PenLine } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, NoPartnerCard, StateCard } from '@/components/games/two-truths/StateCard'
import { HistoryList, ScoreBoard } from '@/components/games/two-truths/RoundHistory'
import { useTwoTruths } from '@/components/games/two-truths/useTwoTruths'
import { GAME_PATH, cap, groupRounds, roundDate, sentWhen } from '@/components/games/two-truths/logic'

function Header() {
  return (
    <GameHeader
      title="Two Truths & a Lie"
      subtitle="Two are true, one is made up. Spot the lie."
      backHref="/app/games"
      backLabel="Games"
    />
  )
}

export default function TwoTruthsPage() {
  const { state, retry } = useTwoTruths()

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
  const { myOpen, theirOpen, history } = groupRounds(list.rounds)
  const closed = ctx.closed

  return (
    <div className="animate-fade-in pb-6">
      <Header />

      <div className="space-y-3 px-6 pt-5">
        {closed && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-cream p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-light">
              {them} left this couple space. Past rounds stay here to look back on, but new rounds and guesses are off.
            </p>
          </div>
        )}

        {theirOpen && !closed && (
          <Link
            href={`${GAME_PATH}/${theirOpen.id}`}
            className="block rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 p-5 text-white shadow-elevated transition-transform active:scale-[0.99]"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Your turn · {roundDate(theirOpen.createdAt)}</p>
            <p className="mt-1 text-lg font-bold leading-snug">{them} sent you a round</p>
            <p className="mt-0.5 text-sm text-white/85">Three statements, one lie. You get one guess.</p>
            <span className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-bold text-sky-700">
              Guess now <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        )}

        {myOpen && (
          <Link
            href={`${GAME_PATH}/${myOpen.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-card transition-all hover:border-sky-200 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600" aria-hidden="true">
              <Hourglass className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">
                {closed ? 'Your last round was never guessed' : `Waiting for ${partnerName} to guess`}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {closed ? 'Open it to cancel it' : `You sent it ${sentWhen(myOpen.createdAt)}`}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        )}

        {!myOpen && !closed && (
          <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600" aria-hidden="true">
                <PenLine className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{history.length ? 'Your turn to bluff' : 'Write the first round'}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  Three things about you, one of them made up. See if {partnerName} can tell.
                </p>
              </div>
            </div>
            <Link href={`${GAME_PATH}/new`} className={buttonVariants({ className: 'mt-4' })}>
              Write a round
            </Link>
          </div>
        )}
      </div>

      {history.length > 0 ? (
        <>
          <div className="px-6 pt-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Score</p>
            <ScoreBoard tally={list.tally} partnerName={partnerName} />
          </div>
          <div className="px-6 pt-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Past rounds</p>
            <HistoryList rounds={history} partnerName={partnerName} />
          </div>
        </>
      ) : closed ? (
        !myOpen && <StateCard icon={Lock} title="No past rounds" body="Nobody guessed a round here before the space closed." />
      ) : (
        <div className="mx-6 mt-7 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-700">How it works</p>
          <ol className="mt-3 space-y-3">
            {[
              'Write three things about yourself. Make one of them up.',
              `${them} gets one guess at which one is the lie.`,
              'The answer shows up for both of you, with the story behind it.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-sky-700" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-sm leading-snug text-ink-light">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
