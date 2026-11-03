'use client'

import { useRouter } from 'next/navigation'
import {
  Brain, Heart, HandHeart, Wallet, Sparkles,
  ChevronRight, Lock, ArrowLeft, ClipboardCheck,
} from 'lucide-react'

const TESTS = [
  {
    id: 'mbti',
    title: 'Tes MBTI',
    desc: 'Temukan tipe kepribadianmu (INTJ, ENFP, dll)',
    icon: Brain,
    color: 'bg-purple-50 text-purple-600',
    available: true,
    href: '/app/partner/mbti',
    badge: null,
  },
  {
    id: 'love-language',
    title: 'Love Language',
    desc: 'Cara kamu memberi & menerima cinta',
    icon: Heart,
    color: 'bg-rose/10 text-rose',
    available: false,
    href: '#',
    badge: 'Segera',
  },
  {
    id: 'apology-language',
    title: 'Bahasa Maaf',
    desc: 'Cara terbaik kamu minta & memberi maaf',
    icon: HandHeart,
    color: 'bg-sage/15 text-sage-dark',
    available: false,
    href: '#',
    badge: 'Segera',
  },
  {
    id: 'spending-habits',
    title: 'Spending Habits',
    desc: 'Gaya kamu mengelola & membelanjakan uang',
    icon: Wallet,
    color: 'bg-gold/15 text-yellow-700',
    available: true,
    href: '/app/about-me/spending-habits',
    badge: 'BARU',
  },
  {
    id: 'attachment-style',
    title: 'Attachment Style',
    desc: 'Pola kelekatan dalam hubunganmu',
    icon: Sparkles,
    color: 'bg-blue-50 text-blue-600',
    available: false,
    href: '#',
    badge: 'Segera',
  },
]

export default function AboutMePage() {
  const router = useRouter()

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div className="border-b border-border bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1 hover:bg-cream">
            <ArrowLeft className="h-5 w-5 text-ink-muted" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink">About Me</h1>
            <p className="text-sm text-ink-muted">Kenali dirimu & pasanganmu lebih dalam</p>
          </div>
        </div>
      </div>

      <div className="px-6 pt-5">
        {/* Readiness Assessment — the couple-level test (was unreachable from the app) */}
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-muted/50">
          Kesiapan Hubungan
        </p>
        <button
          onClick={() => router.push('/assessment')}
          className="mb-7 flex w-full items-center gap-4 rounded-2xl border border-rose/30 bg-gradient-to-br from-rose/10 to-rose/5 p-4 text-left shadow-card transition-all hover:border-rose active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white text-rose">
            <ClipboardCheck className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">Tes Kesiapan Hubungan</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Cek kesiapan kalian: komunikasi, nilai &amp; visi, keuangan, keluarga, komitmen
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-rose" />
        </button>

        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-muted/50">
          Tes Kepribadian
        </p>

        <div className="space-y-3">
          {TESTS.map(test => {
            const Icon = test.icon
            return (
              <button
                key={test.id}
                onClick={() => test.available && router.push(test.href)}
                disabled={!test.available}
                className={`flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-card transition-all ${
                  test.available
                    ? 'border-border hover:border-rose hover:shadow-md active:scale-[0.98]'
                    : 'border-border opacity-60'
                }`}
              >
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${test.color}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink">{test.title}</p>
                    {test.badge && (
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                        {test.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{test.desc}</p>
                </div>
                {test.available ? (
                  <ChevronRight className="h-4 w-4 text-ink-muted" />
                ) : (
                  <Lock className="h-4 w-4 text-ink-muted/50" />
                )}
              </button>
            )
          })}
        </div>

        {/* Info card */}
        <div className="mt-6 rounded-2xl bg-cream p-4 text-center">
          <p className="text-xs text-ink-muted">
            Hasil tes akan tersimpan di profilmu dan bisa dilihat oleh pasanganmu.
            Tes baru ditambahkan secara berkala.
          </p>
        </div>
      </div>
    </div>
  )
}
