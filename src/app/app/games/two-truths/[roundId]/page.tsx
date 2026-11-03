'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CircleHelp, Lock } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, NoPartnerCard, StateCard } from '@/components/games/two-truths/StateCard'
import GuessView from '@/components/games/two-truths/GuessView'
import WaitingView from '@/components/games/two-truths/WaitingView'
import RevealView from '@/components/games/two-truths/RevealView'
import { useTwoTruths } from '@/components/games/two-truths/useTwoTruths'
import { pushPartner } from '@/components/games/two-truths/api'
import {
  GAME_PATH,
  applyGuess,
  cap,
  groupRounds,
  possessive,
  sentWhen,
  tallyWithGuess,
  type GuessResult,
} from '@/components/games/two-truths/logic'

export default function TwoTruthsRoundPage() {
  const params = useParams<{ roundId: string }>()
  const roundId = typeof params?.roundId === 'string' ? params.roundId : ''
  const router = useRouter()
  const { state, retry, reload } = useTwoTruths()
  // My guess as the server answered it, shown before the list reload lands.
  const [local, setLocal] = useState<{ result: GuessResult; at: string } | null>(null)
  // The round was still open while on screen: a result arriving now (my guess,
  // or the partner's guess on my round) gets the animated reveal.
  const sawOpen = useRef(false)

  const listed = state.status === 'ready' ? state.list.rounds.find((r) => r.id === roundId) ?? null : null
  const openNow = !!listed && !listed.guessedAt && !local
  useEffect(() => {
    if (openNow) sawOpen.current = true
  }, [openNow])

  const header = (title: string, subtitle?: string) => (
    <GameHeader title={title} subtitle={subtitle} backHref={GAME_PATH} backLabel="Two Truths & a Lie" />
  )

  if (state.status === 'loading') return <GameSkeleton cards={3} />
  if (state.status === 'error') {
    return (
      <div className="pb-6">
        {header('Two Truths & a Lie')}
        <LoadErrorCard message={state.message} onRetry={retry} />
      </div>
    )
  }
  if (state.status === 'no-partner') {
    return (
      <div className="pb-6">
        {header('Two Truths & a Lie')}
        <NoPartnerCard />
      </div>
    )
  }

  const { ctx, list, partnerName } = state
  const round = listed && local && !listed.guessedAt ? applyGuess(listed, local.result, local.at) : listed

  if (!round) {
    return (
      <div className="pb-6">
        {header('Two Truths & a Lie')}
        <StateCard icon={CircleHelp} title="This round isn't here anymore" body="It may have been canceled before anyone guessed it.">
          <Link href={GAME_PATH} className={buttonVariants({ variant: 'secondary' })}>
            All rounds
          </Link>
        </StateCard>
      </div>
    )
  }

  const title = round.mine ? 'Your round' : `${cap(possessive(partnerName))} round`
  const subtitle = `Sent ${sentWhen(round.createdAt)}`

  if (round.guessedAt) {
    const tally = local && listed && !listed.guessedAt ? tallyWithGuess(list.tally, local.result) : list.tally
    const canWriteNew = !ctx.closed && !!ctx.partner && !groupRounds(list.rounds).myOpen
    return (
      <div className="animate-fade-in pb-6">
        {header(title, subtitle)}
        <RevealView
          key={round.id}
          round={round}
          perspective={round.mine ? 'author' : 'guesser'}
          partnerName={partnerName}
          animate={sawOpen.current}
          tally={tally}
          canWriteNew={canWriteNew}
        />
      </div>
    )
  }

  if (round.mine) {
    return (
      <div className="animate-fade-in pb-6">
        {header(title, subtitle)}
        <WaitingView
          round={round}
          partnerName={partnerName}
          closed={ctx.closed}
          onCanceled={() => router.replace(GAME_PATH)}
          onStale={() => { void reload() }}
        />
      </div>
    )
  }

  if (ctx.closed) {
    return (
      <div className="pb-6">
        {header(title, subtitle)}
        <StateCard icon={Lock} title="This one stays a mystery" body={`The couple space closed before you guessed, so ${possessive(partnerName)} lie stays hidden.`}>
          <Link href={GAME_PATH} className={buttonVariants({ variant: 'secondary' })}>
            All rounds
          </Link>
        </StateCard>
      </div>
    )
  }

  function handleGuessed(result: GuessResult) {
    setLocal({ result, at: new Date().toISOString() })
    const authorId = round?.authorId
    if (authorId && authorId === ctx.partner?.id) {
      pushPartner(authorId, `${ctx.myName ?? 'Your partner'} ${result.correct ? 'spotted your lie' : 'fell for your lie'}`)
    }
    void reload()
  }

  return (
    <div className="animate-fade-in pb-6">
      {header(title, subtitle)}
      <GuessView
        key={round.id}
        round={round}
        partnerName={partnerName}
        onGuessed={handleGuessed}
        onStale={() => { void reload() }}
      />
    </div>
  )
}
