import Image from 'next/image'
import Link from 'next/link'
import {
  Heart,
  Wallet,
  CalendarDays,
  MessageCircle,
  ArrowRight,
  Sparkles,
  Shield,
  Smartphone,
} from 'lucide-react'

const PILLARS = [
  {
    icon: Heart,
    title: 'Hubungan',
    desc: 'Assessment kesiapan, pertanyaan harian, dan tips untuk pasangan',
    color: 'bg-rose/10 text-rose',
  },
  {
    icon: Wallet,
    title: 'Keuangan',
    desc: 'Target tabungan bersama, catatan bulanan, dan wishlist',
    color: 'bg-gold/20 text-yellow-700',
  },
  {
    icon: CalendarDays,
    title: 'Kalender',
    desc: 'Tanggal penting, pengingat anniversary & ulang tahun',
    color: 'bg-sage/20 text-sage-dark',
  },
]

const TRUST_POINTS = [
  { icon: Shield, text: 'Privat & aman' },
  { icon: Smartphone, text: 'Bisa dipasang di homescreen' },
  { icon: Sparkles, text: 'Gratis untuk memulai' },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ===== Hero ===== */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-16 text-center">
        {/* Logo */}
        <div className="animate-fade-in mb-6">
          <Image
            src="/icons/logo-full.png"
            alt="Nanti Kita"
            width={96}
            height={96}
            priority
            className="mx-auto mb-4 h-24 w-24"
          />
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-ink">
            nanti kita
          </h1>
          <p className="text-lg font-semibold text-rose">
            Bucin tapi realistis.
          </p>
        </div>

        <p className="animate-fade-in mx-auto mb-8 max-w-xs text-sm leading-relaxed text-ink-muted">
          Persiapkan masa depan bersama pasanganmu. Dari hubungan yang sehat,
          tabungan yang terencana, sampai hari spesial yang tak terlupa.
        </p>

        {/* CTAs */}
        <div className="animate-slide-up w-full max-w-xs space-y-3">
          <Link
            href="/auth/signup"
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-rose px-6 py-4 text-base font-bold text-white shadow-elevated transition-all hover:shadow-glow active:scale-[0.98]"
          >
            Mulai Gratis
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/auth/login"
            className="flex w-full items-center justify-center rounded-2xl border border-border bg-white px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-rose hover:text-rose"
          >
            Sudah punya akun? Masuk
          </Link>
        </div>
      </div>

      {/* ===== 3 Pillars ===== */}
      <div className="bg-white px-6 py-10">
        <h2 className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-ink-muted">
          Satu Aplikasi, Tiga Kekuatan
        </h2>
        <div className="space-y-3">
          {PILLARS.map(p => (
            <div
              key={p.title}
              className="flex items-start gap-4 rounded-2xl border border-border bg-cream p-4"
            >
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${p.color}`}>
                <p.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">{p.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Trust bar ===== */}
      <div className="border-t border-border bg-white px-6 py-5">
        {/* Three equal columns, icon above text: side by side, the icons shrank
            to dots on narrow phones while the labels wrapped. */}
        <div className="grid grid-cols-3 gap-3">
          {TRUST_POINTS.map(tp => (
            <div key={tp.text} className="flex flex-col items-center gap-1.5 text-center text-xs leading-snug text-ink-muted">
              <tp.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span>{tp.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 text-center">
        <p className="text-[11px] text-ink-muted/50">
          Nanti Kita &copy; 2026. Dibuat dengan cinta di Indonesia.
        </p>
      </div>
    </div>
  )
}
