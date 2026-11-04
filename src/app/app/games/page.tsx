'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, HeartHandshake, VenetianMask, Lock, MessageCircleHeart, Zap } from 'lucide-react'
import { loadHub } from '@/lib/samakan'
import { isMyTurn } from '@/components/games/samakan/ui'

// Pet Kita lives on Home now, not among the games.
const GAMES = [
  {
    id: 'samakan',
    title: 'Samakan',
    desc: 'Guess each other\'s answers',
    icon: Zap,
    color: 'bg-purple-50 text-purple-600',
    available: true,
    href: '/app/games/samakan',
    badge: null,
  },
  {
    id: 'deep-talk',
    title: 'Deep Talk',
    desc: 'Questions that go past small talk',
    icon: MessageCircleHeart,
    color: 'bg-rose/10 text-rose',
    available: true,
    href: '/app/games/deep-talk',
    badge: 'Free',
  },
  {
    id: 'truth-or-dare',
    title: 'Truth or Dare',
    desc: 'Truths and dares for two, on one phone',
    icon: Flame,
    color: 'bg-gold/20 text-yellow-700',
    available: true,
    href: '/app/games/truth-or-dare',
    badge: 'NEW',
  },
  {
    id: 'love-languages',
    title: 'Love Languages',
    desc: 'How each of you feels loved',
    icon: HeartHandshake,
    color: 'bg-sage/20 text-sage-dark',
    available: true,
    href: '/app/games/love-languages',
    badge: 'NEW',
  },
  {
    id: 'two-truths',
    title: 'Two Truths & a Lie',
    desc: 'Hide one lie and see if your partner spots it',
    icon: VenetianMask,
    color: 'bg-blue-50 text-blue-500',
    available: true,
    href: '/app/games/two-truths',
    badge: 'NEW',
  },
]

export default function GamesPage() {
  const router = useRouter()
  // "Your turn" on the Samakan card when the partner is waiting on my answers.
  const [samakanTurn, setSamakanTurn] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadHub()
      .then((hub) => {
        if (!cancelled) setSamakanTurn(!!hub.openSet && !hub.closed && isMyTurn(hub.openSet, hub.me))
      })
      .catch(() => {
        // The badge is a nicety; the card works without it.
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="animate-fade-in pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <h1 className="text-xl font-bold text-ink">Games</h1>
        <p className="text-sm text-ink-muted">Things to play together</p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 pt-6">
        {GAMES.map(game => {
          const Icon = game.icon
          const badge = game.id === 'samakan' && samakanTurn ? 'Your turn' : game.badge
          return (
            <button
              key={game.id}
              onClick={() => game.available && router.push(game.href)}
              disabled={!game.available}
              className={`relative flex flex-col items-start rounded-2xl border bg-white p-4 text-left shadow-card transition-colors ${
                game.available
                  ? 'border-border hover:border-rose'
                  : 'border-border opacity-60'
              }`}
            >
              {badge && (
                <div className="absolute right-3 top-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    badge === 'Your turn' ? 'bg-purple-100 text-purple-700' : 'bg-rose/10 text-rose'
                  }`}>{badge}</span>
                </div>
              )}
              {!game.available && (
                <div className="absolute right-3 top-3">
                  <Lock className="h-3.5 w-3.5 text-ink-muted" />
                </div>
              )}
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${game.color}`}>
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="text-sm font-semibold text-ink">{game.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{game.desc}</p>
              {!game.available && (
                <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Coming soon
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
