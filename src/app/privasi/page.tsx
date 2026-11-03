import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export const metadata = { title: 'Privasi & Data — Nanti Kita' }

// Plain-language summary of how the app handles data, written from what the
// code actually does. Review with the owner before each deploy if features change.
const SECTIONS = [
  {
    title: 'Data yang disimpan',
    items: [
      'Akun: email dan password (password disimpan terenkripsi oleh layanan login).',
      'Profil: nama, gender, tanggal lahir, tanggal jadian, dan foto profil.',
      'Data berdua: jawaban pertanyaan dan quiz, Surat Rahasia, kalender, tabungan dan wishlist, pet, hasil game, serta Moment (foto, judul, tanggal, nama tempat, koordinat GPS, dan cerita).',
      'Perangkat: alamat notifikasi push, hanya jika kamu mengaktifkan notifikasi.',
    ],
  },
  {
    title: 'Siapa yang bisa melihat',
    items: [
      'Data berdua hanya bisa dilihat kamu dan pasanganmu.',
      'Foto Moment disimpan di penyimpanan privat dan hanya ditampilkan lewat tautan sementara untuk kalian berdua.',
      'Isi Surat Rahasia tidak bisa dibuka penerima sebelum waktunya, termasuk lewat aplikasi lain.',
      'Admin aplikasi bisa melihat data profil akun untuk mengelola pengguna, tapi tidak bisa membuka data berdua, foto Moment, atau isi surat kalian.',
    ],
  },
  {
    title: 'Lokasi',
    items: [
      'Lokasi hanya dipakai saat kamu menekan "Pakai lokasi sekarang", atau saat foto yang kamu pilih menyimpan lokasi.',
      'Koordinat hanya disimpan di Moment itu. Untuk mencari nama tempat, koordinat dikirim ke OpenStreetMap.',
    ],
  },
  {
    title: 'Layanan pihak ketiga',
    items: [
      'Supabase: database, login, dan penyimpanan foto.',
      'Vercel: hosting aplikasi.',
      'OpenRouter, yang meneruskannya ke model GPT Luna buatan OpenAI: membuat Pertanyaan AI. Yang dikirim: nama panggilan, gender, usia, tipe MBTI, lama bersama, nama hari, judul dan tanggal acara mendatang di kalender, dan 7 Pertanyaan AI terakhir kalian.',
      'OpenRouter dan OpenAI (GPT Luna) juga membuat Ide Date AI. Yang dikirim: pilihan budget, suasana, dan tempat, kota (kalau diisi), tanggal hari ini, dan judul-judul bucket list kalian. Nama dan data profil tidak ikut dikirim.',
      'OpenStreetMap: nama tempat dan peta di Moment.',
      'Layanan push bawaan browser (Google, Apple, atau Mozilla): mengantar notifikasi.',
    ],
  },
  {
    title: 'Menghapus data',
    items: [
      'Moment, foto, transaksi, dan data lain bisa kamu hapus langsung dari aplikasi.',
      'Unduh data saya (Profil → Pengaturan) memberimu salinan datamu dalam satu file.',
      'Keluar dari pasangan (Profil → Zona bahaya) menutup ruang kalian: kenangan bersama tetap tersimpan untuk pasanganmu, tapi tidak ada orang baru yang bisa bergabung ke ruang itu.',
      'Hapus akun (Profil → Zona bahaya) menghapus akun, profil, foto profil, serta surat dan apresiasi yang melibatkanmu. Kalau kamu anggota terakhir, seluruh ruang beserta fotonya ikut terhapus.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="animate-fade-in px-6 pb-12 pt-6">
      <Link href="/app/profile" className="mb-5 flex items-center gap-1 text-sm text-ink-muted">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage/15">
          <Shield className="h-5 w-5 text-sage-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">Privasi & Data</h1>
          <p className="text-xs text-ink-muted">Bagaimana Nanti Kita menjaga data kalian</p>
        </div>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-sm font-bold text-ink">{section.title}</h2>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[11px] text-ink-muted/70">Terakhir diperbarui 26 Oktober 2026</p>
    </div>
  )
}
