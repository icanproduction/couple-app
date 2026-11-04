import Link from 'next/link'
import {
  Archive, Bell, BellRing, BookHeart, CalendarDays, Camera, ChartColumn, Gamepad2, Gift,
  Heart, ListChecks, Mail, Map, MessageCircleHeart, PawPrint, Route, Settings, Smile,
  Trophy, User, Wallet, WandSparkles, type LucideIcon,
} from 'lucide-react'

export const metadata = { title: 'Jelajah · Nanti Kita' }

interface Tile {
  href: string
  icon: LucideIcon
  label: string
  desc: string
  tone: string
  badge?: string
}

interface Section {
  title: string
  tiles: Tile[]
}

const ROSE = 'bg-rose/10 text-rose'
const SAGE = 'bg-sage/15 text-sage-dark'
const GOLD = 'bg-gold/15 text-yellow-700'
const PURPLE = 'bg-purple-50 text-purple-600'
const BLUE = 'bg-blue-50 text-blue-600'

const SECTIONS: Section[] = [
  {
    title: 'Us',
    tiles: [
      { href: '/app/partner', icon: Heart, label: 'Partner', desc: 'Get to know them better', tone: ROSE },
      { href: '/app/mood', icon: Smile, label: 'Daily Mood', desc: 'How you feel today', tone: GOLD, badge: 'New' },
      { href: '/app/toples', icon: Gift, label: 'Jar', desc: 'Little notes of thanks', tone: ROSE, badge: 'New' },
      { href: '/app/aktivitas', icon: Bell, label: 'Activity', desc: "What's new with you two", tone: BLUE, badge: 'New' },
      { href: '/app/milestone', icon: Trophy, label: 'Milestones', desc: '100 days, 1 year and more', tone: GOLD, badge: 'New' },
      { href: '/app/perjalanan', icon: Route, label: 'Our Story', desc: 'Everything on one timeline', tone: PURPLE, badge: 'New' },
      { href: '/app/recap', icon: ChartColumn, label: 'Monthly Recap', desc: 'Your month, summed up', tone: SAGE, badge: 'New' },
    ],
  },
  {
    title: 'Memories',
    tiles: [
      { href: '/app/moments', icon: Camera, label: 'Moments', desc: 'Photos and stories from every date', tone: ROSE },
      { href: '/app/moments/peta', icon: Map, label: 'Moments Map', desc: "Places you've been", tone: SAGE, badge: 'New' },
      { href: '/app/moments/scrapbook', icon: BookHeart, label: 'Scrapbook', desc: 'Turn memories into a book', tone: PURPLE, badge: 'New' },
      { href: '/app/letters', icon: Mail, label: 'Letters', desc: 'Letters that open later', tone: GOLD },
    ],
  },
  {
    title: 'Talk & Play',
    tiles: [
      { href: '/app/games/deep-talk', icon: MessageCircleHeart, label: 'Deep Talk', desc: 'Themed question packs', tone: ROSE, badge: 'New' },
      { href: '/app/games', icon: Gamepad2, label: 'Games', desc: 'Samakan and more', tone: PURPLE },
      { href: '/app/arsip-pertanyaan', icon: Archive, label: 'Past Answers', desc: 'Your daily answers', tone: BLUE, badge: 'New' },
      { href: '/app/pet', icon: PawPrint, label: 'Pet Kita', desc: 'Grows with what you two do', tone: SAGE, badge: 'New' },
    ],
  },
  {
    title: 'Plans',
    tiles: [
      { href: '/app/bucket-list', icon: ListChecks, label: 'Bucket List', desc: 'Things to try together', tone: SAGE, badge: 'New' },
      { href: '/app/ide-date', icon: WandSparkles, label: 'AI Date Ideas', desc: 'Not sure where to go?', tone: PURPLE, badge: 'New' },
      { href: '/app/calendar', icon: CalendarDays, label: 'Calendar', desc: 'Dates and reminders', tone: GOLD },
      { href: '/app/finance', icon: Wallet, label: 'Money', desc: 'Savings and wishlist', tone: ROSE },
    ],
  },
  {
    title: 'About You',
    tiles: [
      { href: '/app/about-me', icon: User, label: 'About Me', desc: 'MBTI, love language and more', tone: SAGE },
      { href: '/app/profile/notifikasi', icon: BellRing, label: 'Notifications', desc: 'Types and quiet hours', tone: BLUE, badge: 'New' },
      { href: '/app/profile', icon: Settings, label: 'Profile & Account', desc: 'Data, invites, privacy', tone: GOLD },
    ],
  },
]

export default function JelajahPage() {
  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <h1 className="text-xl font-bold text-ink">Jelajah</h1>
        <p className="text-sm text-ink-muted">Everything you can do together</p>
      </div>

      <div className="space-y-6 px-6 pt-5">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-labelledby={`jelajah-${section.title}`}>
            <h2
              id={`jelajah-${section.title}`}
              className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted/60"
            >
              {section.title}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {section.tiles.map((tile) => {
                const Icon = tile.icon
                return (
                  <Link
                    key={tile.href}
                    href={tile.href}
                    className="relative flex flex-col rounded-2xl border border-border bg-white p-4 shadow-card transition-all hover:border-rose/40 hover:shadow-md active:scale-[0.98]"
                  >
                    {tile.badge && (
                      <span className="absolute right-3 top-3 rounded-full bg-rose px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        {tile.badge}
                      </span>
                    )}
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tile.tone}`}>
                      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </div>
                    <p className="text-sm font-bold text-ink">{tile.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{tile.desc}</p>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
