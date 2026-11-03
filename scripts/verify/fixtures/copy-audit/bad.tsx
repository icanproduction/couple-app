'use client'
import { x } from '@/lib/couple'
const CATS = [{ value: 'petualangan', label: 'Petualangan seru' }]
export function Bad() {
  const msg = 'Gagal menyimpan, coba lagi ya'
  const t = `Halo ${'x'}, pasanganmu kirim Kangen`
  return <button title="Simpan surat" className="px-4 di-hidden">Kirim sekarang — oke</button>
}
