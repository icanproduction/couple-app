'use client'

import Link from 'next/link'
import { Camera, ChevronRight, Compass, Gamepad2, ListChecks, MessageCircleHeart, WandSparkles } from 'lucide-react'

// Calendar and Money have their own bottom-nav tabs; everything else is in Jelajah.
const TILES = [
  {
    href: '/app/games/deep-talk',
    icon: MessageCircleHeart,
    label: 'Deep Talk',
    desc: 'Pick a theme and talk',
    iconBg: 'bg-rose/10',
    iconColor: 'text-rose',
    hoverBorder: 'hover:border-rose',
  },
  {
    href: '/app/bucket-list',
    icon: ListChecks,
    label: 'Bucket List',
    desc: 'Things to try together',
    iconBg: 'bg-sage/15',
    iconColor: 'text-sage-dark',
    hoverBorder: 'hover:border-sage',
  },
  {
    href: '/app/ide-date',
    icon: WandSparkles,
    label: 'AI Date Ideas',
    desc: 'Not sure where to go?',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    hoverBorder: 'hover:border-purple-300',
  },
  {
    href: '/app/games',
    icon: Gamepad2,
    label: 'Games',
    desc: 'Play with your partner',
    iconBg: 'bg-gold/15',
    iconColor: 'text-yellow-700',
    hoverBorder: 'hover:border-gold',
  },
]

export default function QuickAccessGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 px-6">
      <Link
        href="/app/moments"
        className="col-span-2 flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-card transition-all hover:border-rose hover:shadow-md active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose/10">
          <Camera className="h-6 w-6 text-rose" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Moments</p>
          <p className="text-[11px] text-ink-muted">Photos, places and stories from every date</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
      </Link>
      {TILES.map(tile => {
        const Icon = tile.icon
        return (
          <Link
            key={tile.href}
            href={tile.href}
            className={`group flex flex-col justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition-all ${tile.hoverBorder} hover:shadow-md active:scale-[0.98]`}
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tile.iconBg}`}>
              <Icon className={`h-5 w-5 ${tile.iconColor}`} strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{tile.label}</p>
              <p className="text-[11px] text-ink-muted">{tile.desc}</p>
            </div>
          </Link>
        )
      })}
      <Link
        href="/app/jelajah"
        className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-rose/40 bg-rose/5 py-3 text-xs font-bold text-rose transition-all hover:bg-rose/10 active:scale-[0.98]"
      >
        <Compass className="h-4 w-4" aria-hidden /> See all features
      </Link>
    </div>
  )
}
