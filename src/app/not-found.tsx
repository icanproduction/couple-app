import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center animate-fade-in">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15">
        <Compass className="h-8 w-8 text-yellow-700" />
      </div>
      <h1 className="text-xl font-bold text-ink">Halaman tidak ditemukan</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
        Mungkin tautannya sudah berubah atau halamannya sudah tidak ada.
      </p>
      <Link
        href="/app/home"
        className="mt-8 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
      >
        Ke Beranda
      </Link>
    </div>
  )
}
