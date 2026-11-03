'use client'

import { useRouter } from 'next/navigation'
import { Shuffle, MessageSquare, Sparkles, Lock, MessageCircleHeart, Zap, PawPrint } from 'lucide-react'

const GAMES = [
  {
    id: 'pet',
    title: 'Pet Kita',
    desc: 'Rawat hewan peliharaan virtual berdua',
    icon: PawPrint,
    color: 'bg-amber-50 text-amber-600',
    available: true,
    href: '/app/pet',
    badge: 'BARU',
  },
  {
    id: 'samakan',
    title: 'Sinkronisasi',
    desc: 'Main bareng pasangan real-time',
    icon: Zap,
    color: 'bg-purple-50 text-purple-600',
    available: true,
    href: '/app/games/samakan',
    badge: 'BARU',
  },
  {
    id: 'deep-talk',
    title: 'Deep Talk',
    desc: 'Obrolan bertema untuk saling kenal lebih dalam',
    icon: MessageCircleHeart,
    color: 'bg-rose/10 text-rose',
    available: true,
    href: '/app/games/deep-talk',
    badge: 'Gratis',
  },
  {
    id: 'truth-or-dare',
    title: 'Truth or Dare',
    desc: 'Tantangan seru untuk pasangan',
    icon: Shuffle,
    color: 'bg-gold/20 text-yellow-700',
    available: false,
    href: '#',
    badge: null,
  },
  {
    id: 'love-language',
    title: 'Quiz Bahasa Cinta',
    desc: 'Temukan cara cintamu',
    icon: MessageSquare,
    color: 'bg-sage/20 text-sage-dark',
    available: false,
    href: '#',
    badge: null,
  },
  {
    id: 'compatibility',
    title: 'Tes Kompatibilitas',
    desc: 'Seberapa cocok kalian?',
    icon: Sparkles,
    color: 'bg-blue-50 text-blue-500',
    available: false,
    href: '#',
    badge: null,
  },
]

export default function GamesPage() {
  const router = useRouter()

  return (
    <div className="animate-fade-in pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <h1 className="text-xl font-bold text-ink">Games</h1>
        <p className="text-sm text-ink-muted">Aktivitas seru berdua</p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 pt-6">
        {GAMES.map(game => {
          const Icon = game.icon
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
              {game.badge && (
                <div className="absolute right-3 top-3">
                  <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] font-bold text-rose">{game.badge}</span>
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
                  Segera hadir
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
