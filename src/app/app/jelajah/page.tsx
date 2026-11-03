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
    title: 'Kita Berdua',
    tiles: [
      { href: '/app/partner', icon: Heart, label: 'Pasangan', desc: 'Kenali dia lebih dalam', tone: ROSE },
      { href: '/app/mood', icon: Smile, label: 'Mood Harian', desc: 'Lagi ngerasa apa hari ini', tone: GOLD, badge: 'Baru' },
      { href: '/app/toples', icon: Gift, label: 'Toples Apresiasi', desc: 'Simpan rasa terima kasih', tone: ROSE, badge: 'Baru' },
      { href: '/app/aktivitas', icon: Bell, label: 'Aktivitas', desc: 'Apa yang baru dari kalian', tone: BLUE, badge: 'Baru' },
      { href: '/app/milestone', icon: Trophy, label: 'Milestone', desc: '100 hari, 1 tahun, dan seterusnya', tone: GOLD, badge: 'Baru' },
      { href: '/app/perjalanan', icon: Route, label: 'Perjalanan Kita', desc: 'Semua cerita dalam satu garis', tone: PURPLE, badge: 'Baru' },
      { href: '/app/recap', icon: ChartColumn, label: 'Recap Bulanan', desc: 'Rangkuman bulan kalian', tone: SAGE, badge: 'Baru' },
    ],
  },
  {
    title: 'Kenangan',
    tiles: [
      { href: '/app/moments', icon: Camera, label: 'Moment', desc: 'Foto & cerita setiap date', tone: ROSE },
      { href: '/app/moments/peta', icon: Map, label: 'Peta Moment', desc: 'Tempat-tempat kalian', tone: SAGE, badge: 'Baru' },
      { href: '/app/moments/scrapbook', icon: BookHeart, label: 'Scrapbook', desc: 'Cetak kenangan jadi buku', tone: PURPLE, badge: 'Baru' },
      { href: '/app/letters', icon: Mail, label: 'Surat Rahasia', desc: 'Surat yang terkunci waktu', tone: GOLD },
    ],
  },
  {
    title: 'Ngobrol & Main',
    tiles: [
      { href: '/app/games/deep-talk', icon: MessageCircleHeart, label: 'Deep Talk', desc: 'Paket obrolan bertema', tone: ROSE, badge: 'Baru' },
      { href: '/app/games', icon: Gamepad2, label: 'Games', desc: 'Samakan & lainnya', tone: PURPLE },
      { href: '/app/arsip-pertanyaan', icon: Archive, label: 'Arsip Jawaban', desc: 'Jawaban harian kalian', tone: BLUE, badge: 'Baru' },
      { href: '/app/pet', icon: PawPrint, label: 'Peliharaan', desc: 'Rawat bareng-bareng', tone: SAGE },
    ],
  },
  {
    title: 'Rencana',
    tiles: [
      { href: '/app/bucket-list', icon: ListChecks, label: 'Bucket List', desc: 'Hal yang mau dicoba berdua', tone: SAGE, badge: 'Baru' },
      { href: '/app/ide-date', icon: WandSparkles, label: 'Ide Date AI', desc: 'Bingung mau ke mana?', tone: PURPLE, badge: 'Baru' },
      { href: '/app/calendar', icon: CalendarDays, label: 'Kalender', desc: 'Tanggal penting & pengingat', tone: GOLD },
      { href: '/app/finance', icon: Wallet, label: 'Keuangan', desc: 'Tabungan & wishlist', tone: ROSE },
    ],
  },
  {
    title: 'Tentang Kamu',
    tiles: [
      { href: '/app/about-me', icon: User, label: 'About Me', desc: 'MBTI, love language, dll', tone: SAGE },
      { href: '/app/profile/notifikasi', icon: BellRing, label: 'Notifikasi', desc: 'Atur jenis & jam tenang', tone: BLUE, badge: 'Baru' },
      { href: '/app/profile', icon: Settings, label: 'Profil & Akun', desc: 'Data, undangan, privasi', tone: GOLD },
    ],
  },
]

export default function JelajahPage() {
  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <h1 className="text-xl font-bold text-ink">Jelajah</h1>
        <p className="text-sm text-ink-muted">Semua yang bisa kalian lakukan berdua</p>
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
