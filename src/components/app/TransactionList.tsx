'use client'

import { ArrowDownLeft, Heart, ShoppingBag, Utensils, Gift, HelpCircle, ChevronRight } from 'lucide-react'
import { todayJakarta, daysSince } from '@/lib/dates'
import { fmtRpShort } from '@/lib/finance'

export interface TransactionItem {
  id: string
  amount: number
  type: string
  category: string | null
  note: string | null
  created_by: string | null
  created_at: string | null
  goal_id?: string | null
}

interface TransactionListProps {
  transactions: TransactionItem[]
  userId: string
  partnerName: string | null
  userName: string | null
  /** Tapping a deposit/withdrawal opens the editor (F06) */
  onSelect?: (tx: TransactionItem) => void
}

export const CATEGORY_META: Record<string, { icon: typeof Heart; label: string; color: string }> = {
  tabungan: { icon: ArrowDownLeft, label: 'Savings', color: 'bg-sage/10 text-sage-dark' },
  date_night: { icon: Utensils, label: 'Date night', color: 'bg-purple-50 text-purple-600' },
  anniversary: { icon: Heart, label: 'Anniversary', color: 'bg-rose/10 text-rose' },
  belanja: { icon: ShoppingBag, label: 'Shopping', color: 'bg-gold/20 text-yellow-700' },
  persiapan_nikah: { icon: Gift, label: 'Wedding prep', color: 'bg-blue-50 text-blue-600' },
  lainnya: { icon: HelpCircle, label: 'Other', color: 'bg-ink/5 text-ink-muted' },
}

/** Relative label by Jakarta calendar day (not a rolling 24h window) */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const diffDays = daysSince(todayJakarta(d))

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
}

export default function TransactionList({ transactions, userId, partnerName, userName, onSelect }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">No transactions yet</p>
        <p className="mt-0.5 text-xs text-ink-muted/60">Log your first money in above</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {transactions.map(tx => {
        const isDeposit = tx.type === 'deposit'
        const meta = CATEGORY_META[tx.category ?? 'lainnya'] ?? CATEGORY_META.lainnya // copy-ok: stored value
        const Icon = isDeposit ? ArrowDownLeft : meta.icon
        const iconColor = isDeposit ? 'bg-sage/10 text-sage-dark' : meta.color
        const isMe = tx.created_by === userId
        // First names keep the pill short; the full name doesn't fit a phone row.
        const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null
        const whoLabel = isMe ? (firstName(userName) ?? 'You') : tx.created_by ? (firstName(partnerName) ?? 'Your partner') : 'Deleted account'
        const title = tx.note ?? (isDeposit ? 'Savings' : meta.label)
        const editable = !!onSelect && (tx.type === 'deposit' || tx.type === 'withdrawal')

        const content = (
          <>
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconColor}`}>
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-ink truncate">{title}</p>
              </div>
              {/* One line: a long name truncates instead of wrapping into a tall pill */}
              <div className="flex min-w-0 items-center gap-2 mt-0.5">
                <span className={`min-w-0 max-w-[9rem] truncate whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isMe ? 'bg-rose/10 text-rose' : 'bg-sage/10 text-sage-dark'
                }`}>
                  {whoLabel}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-ink-muted">{formatDate(tx.created_at)}</span>
              </div>
            </div>
            <span className={`shrink-0 whitespace-nowrap text-sm font-bold ${isDeposit ? 'text-sage-dark' : 'text-rose'}`}>
              {isDeposit ? '+' : '-'}{fmtRpShort(Math.abs(Number(tx.amount)))}
            </span>
            {editable && <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted/40" aria-hidden />}
          </>
        )

        return editable ? (
          <button
            key={tx.id}
            type="button"
            onClick={() => onSelect?.(tx)}
            aria-label={`Edit transaction: ${title}`}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream active:bg-cream"
          >
            {content}
          </button>
        ) : (
          <div key={tx.id} className="flex items-center gap-3 px-4 py-3">{content}</div>
        )
      })}
    </div>
  )
}
