// Shared savings helpers (F06, F07, F10). Import-free so the summary maths can
// be checked in plain node (scripts/verify/finance-calendar.mjs).

export type TxType = 'deposit' | 'withdrawal'

/** Categories a withdrawal can have (deposits are always "tabungan"). */
export const WITHDRAWAL_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'date_night', label: 'Date Night' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'belanja', label: 'Belanja' },
  { value: 'persiapan_nikah', label: 'Persiapan Nikah' },
  { value: 'lainnya', label: 'Lainnya' },
]

export function categoryLabel(category: string | null): string {
  if (category === 'tabungan') return 'Tabungan'
  return WITHDRAWAL_CATEGORIES.find((c) => c.value === category)?.label ?? 'Lainnya'
}

/** Deposits are stored positive, withdrawals negative (a DB check enforces it). */
export function signedAmount(type: TxType, amount: number): number {
  const abs = Math.abs(amount)
  return type === 'withdrawal' ? -abs : abs
}

/** "1.500.000" typed in an input → 1500000 */
export function parseRupiahInput(val: string): number {
  return parseInt(val.replace(/\D/g, ''), 10) || 0
}

/** Digits → "1.500.000" while typing */
export function formatRupiahInput(val: string): string {
  const num = val.replace(/\D/g, '')
  return num ? parseInt(num, 10).toLocaleString('id-ID') : ''
}

/** Compact amount keeping the sign: -1500000 → "-Rp1.5jt" */
export function fmtRpShort(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1)}jt`
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toFixed(0)}rb`
  return `${sign}Rp${abs.toLocaleString('id-ID')}`
}

/** Full amount keeping the sign: "-Rp 1.500.000" */
export function fmtRpFull(n: number): string {
  return `${n < 0 ? '-' : ''}Rp ${Math.abs(n).toLocaleString('id-ID')}`
}

// ---------- Months (Asia/Jakarta) ----------

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** "YYYY-MM" of a timestamp in Jakarta time. */
export function jakartaMonthKey(at: string | Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' })
    .format(d).slice(0, 7)
}

/** "2026-10" shifted by `delta` months. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

/** "2026-10" → "Oktober 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

// ---------- Monthly summary (F10) ----------

export interface SummaryTx {
  amount: number | string
  type: string
  category: string | null
  created_by: string | null
  created_at: string | null
}

export interface MonthSummary {
  count: number
  totalIn: number
  totalOut: number
  net: number
  /** Withdrawals per category, largest first */
  byCategory: Array<{ category: string; total: number }>
  /** Transactions per writer (profile id; '' = deleted account) */
  countByPerson: Record<string, number>
}

export function summarizeMonth(txs: SummaryTx[], monthKey: string): MonthSummary {
  let totalIn = 0
  let totalOut = 0
  let count = 0
  const cats = new Map<string, number>()
  const countByPerson: Record<string, number> = {}
  for (const tx of txs) {
    if (!tx.created_at || jakartaMonthKey(tx.created_at) !== monthKey) continue
    const amt = Math.abs(Number(tx.amount))
    if (tx.type === 'deposit') totalIn += amt
    else if (tx.type === 'withdrawal') {
      totalOut += amt
      const cat = tx.category ?? 'lainnya'
      cats.set(cat, (cats.get(cat) ?? 0) + amt)
    } else continue
    count++
    const who = tx.created_by ?? ''
    countByPerson[who] = (countByPerson[who] ?? 0) + 1
  }
  const byCategory = Array.from(cats, ([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
  return { count, totalIn, totalOut, net: totalIn - totalOut, byCategory, countByPerson }
}

// ---------- Errors ----------

/** The goal being edited or saved into no longer exists (deleted elsewhere). */
export const GOAL_GONE_MESSAGE = 'Target ini sudah dihapus. Mungkin baru dihapus pasanganmu.'

/**
 * Indonesian message for a failed transaction write. The balance triggers
 * already raise Indonesian text ("Saldo tabungan jadi minus…"); everything
 * else gets a friendly fallback.
 */
export function transactionErrorMessage(
  err: { message?: string; code?: string } | null | undefined,
  fallback = 'Gagal menyimpan perubahan. Coba lagi ya.',
): string {
  if (!err) return fallback
  const msg = err.message ?? ''
  if (/Saldo tabungan/i.test(msg)) return msg
  if (err.code === '23514') return 'Jumlah tidak cocok dengan jenis transaksi.'
  if (err.code === '42501') return 'Kamu tidak punya izin untuk mengubah transaksi ini.'
  if (/fetch|network/i.test(msg)) return 'Koneksi bermasalah. Cek internet kamu lalu coba lagi.'
  return fallback
}
