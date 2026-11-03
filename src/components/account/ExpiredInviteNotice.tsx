import { Clock } from 'lucide-react'

/** Shown by the join forms when join_couple says the code has expired. */
export function ExpiredInviteNotice() {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3">
      <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" />
      <div>
        <p className="text-sm font-semibold text-ink">Kode undangan sudah kedaluwarsa</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          Kode berlaku 7 hari. Minta pasanganmu buka Profil lalu ketuk &ldquo;Buat kode baru&rdquo;,
          kemudian masukkan kode barunya di sini.
        </p>
      </div>
    </div>
  )
}
