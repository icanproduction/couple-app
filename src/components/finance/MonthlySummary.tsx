'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  categoryLabel, fmtRpShort, jakartaMonthKey, monthLabel, shiftMonth, summarizeMonth,
  type SummaryTx,
} from '@/lib/finance'

interface SummaryTransaction extends SummaryTx {
  goal_id?: string | null
}

interface MonthlySummaryProps {
  /** Every transaction of the couple (all goals) */
  transactions: SummaryTransaction[]
  selectedGoal: { id: string; name: string } | null
  goalCount: number
  userId: string
  userName: string | null
  partnerId: string | null
  partnerName: string | null
}

const CATEGORY_BAR: Record<string, string> = {
  date_night: 'bg-purple-400', anniversary: 'bg-rose', belanja: 'bg-yellow-500',
  persiapan_nikah: 'bg-blue-400', lainnya: 'bg-ink-muted/50',
}

/** Monthly totals (Jakarta months) with spending per category and per partner (F10). */
export default function MonthlySummary({
  transactions, selectedGoal, goalCount, userId, userName, partnerId, partnerName,
}: MonthlySummaryProps) {
  const currentMonth = jakartaMonthKey()
  const [month, setMonth] = useState(currentMonth)
  const [scope, setScope] = useState<'goal' | 'all'>('goal')

  const effectiveScope = goalCount > 1 && selectedGoal ? scope : 'all'
  const scoped = useMemo(
    () => effectiveScope === 'goal' && selectedGoal
      ? transactions.filter(t => t.goal_id === selectedGoal.id)
      : transactions,
    [transactions, effectiveScope, selectedGoal],
  )
  const earliest = useMemo(() => {
    let min = currentMonth
    for (const t of scoped) {
      if (!t.created_at) continue
      const k = jakartaMonthKey(t.created_at)
      if (k < min) min = k
    }
    return min
  }, [scoped, currentMonth])

  const summary = useMemo(() => summarizeMonth(scoped, month), [scoped, month])
  const maxCat = summary.byCategory[0]?.total ?? 0

  const people: Array<{ key: string; label: string; count: number }> = []
  const seen = new Set<string>()
  const pushPerson = (key: string, label: string) => {
    seen.add(key)
    const count = summary.countByPerson[key] ?? 0
    if (count > 0) people.push({ key, label, count })
  }
  pushPerson(userId, userName ? `${userName} (kamu)` : 'Kamu')
  if (partnerId) pushPerson(partnerId, partnerName ?? 'Pasangan')
  const others = Object.entries(summary.countByPerson)
    .filter(([k]) => !seen.has(k))
    .reduce((s, [, n]) => s + n, 0)
  if (others > 0) people.push({ key: 'others', label: 'Akun lain / dihapus', count: others })

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-card" aria-labelledby="ringkasan-title">
      <div className="flex items-center justify-between">
        <h2 id="ringkasan-title" className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Ringkasan</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth(m => shiftMonth(m, -1))} disabled={month <= earliest}
            aria-label="Bulan sebelumnya"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-cream disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-bold text-ink">{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={month >= currentMonth}
            aria-label="Bulan berikutnya"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-cream disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {goalCount > 1 && selectedGoal && (
        <div className="mt-3 flex rounded-xl border border-border bg-cream p-0.5 text-xs font-semibold">
          {([['goal', selectedGoal.name], ['all', 'Semua target']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setScope(key)} aria-pressed={scope === key}
              className={cn('flex-1 truncate rounded-lg px-2 py-1.5 transition-colors',
                scope === key ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Total label="Masuk" value={fmtRpShort(summary.totalIn)} icon={<ArrowDownLeft className="h-3.5 w-3.5 text-sage-dark" />} />
        <Total label="Keluar" value={fmtRpShort(summary.totalOut)} icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose" />} />
        <Total label="Bersih" value={`${summary.net > 0 ? '+' : ''}${fmtRpShort(summary.net)}`}
          icon={<Scale className="h-3.5 w-3.5 text-ink-muted" />}
          tone={summary.net < 0 ? 'text-rose' : summary.net > 0 ? 'text-sage-dark' : 'text-ink'} />
      </div>

      {summary.count === 0 ? (
        <p className="mt-4 rounded-xl bg-cream px-3 py-3 text-center text-xs text-ink-muted">
          Belum ada transaksi di {monthLabel(month)}.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-ink">Pengeluaran per kategori</p>
            {summary.byCategory.length === 0 ? (
              <p className="text-xs text-ink-muted">Tidak ada pengeluaran bulan ini. Mantap!</p>
            ) : (
              <ul className="space-y-2">
                {summary.byCategory.map(c => (
                  <li key={c.category}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{categoryLabel(c.category)}</span>
                      <span className="font-semibold text-ink">{fmtRpShort(c.total)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
                      <div className={cn('h-full rounded-full', CATEGORY_BAR[c.category] ?? CATEGORY_BAR.lainnya)}
                        style={{ width: `${maxCat > 0 ? Math.max(4, Math.round((c.total / maxCat) * 100)) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-semibold text-ink">Yang mencatat</p>
            <ul className="space-y-1">
              {people.map(p => (
                <li key={p.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-muted">{p.label}</span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-ink">{p.count} transaksi</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}

function Total({ label, value, icon, tone = 'text-ink' }: { label: string; value: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-cream px-2 py-2.5">
      {icon}
      <p className={cn('text-sm font-bold', tone)}>{value}</p>
      <p className="text-[10px] text-ink-muted">{label}</p>
    </div>
  )
}
