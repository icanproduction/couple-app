'use client'

import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { WITHDRAWAL_CATEGORIES, GOAL_GONE_MESSAGE, transactionErrorMessage } from '@/lib/finance'

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  coupleId: string
  goalId: string | null
  userId: string
  userName: string | null
  partnerId: string | null
  goalName: string | null
  onSuccess: () => void
  initialType?: 'deposit' | 'withdrawal'
  /** Balance shown as a hint for withdrawals (re-checked on submit) */
  balance?: number | null
  /** The goal was deleted elsewhere; the parent closes the sheet and says so */
  onGoalGone?: () => void
}

const QUICK_AMOUNTS = [500_000, 1_000_000, 2_000_000, 5_000_000]

function fmtQuick(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}jt`
  return `${n / 1_000}rb`
}

function fmtRpFull(n: number): string {
  return `${n < 0 ? '-' : ''}Rp ${Math.abs(n).toLocaleString('id-ID')}`
}

function fmtRpNotif(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `Rp${(abs / 1_000_000).toFixed(1)}jt`
  if (abs >= 1_000) return `Rp${(abs / 1_000).toFixed(0)}rb`
  return `Rp${abs.toLocaleString('id-ID')}`
}

export default function AddTransactionModal({
  isOpen, onClose, coupleId, goalId, userId, userName, partnerId, goalName, onSuccess, initialType = 'deposit',
  balance = null, onGoalGone,
}: AddTransactionModalProps) {
  const [type, setType] = useState<'deposit' | 'withdrawal'>(initialType)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('tabungan')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setType(initialType)
      setCategory(initialType === 'withdrawal' ? 'lainnya' : 'tabungan')
    }
  }, [isOpen, initialType])

  function resetForm() {
    setType('deposit'); setAmount(''); setNote(''); setCategory('tabungan'); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numAmount = parseInt(amount.replace(/\D/g, ''), 10)
    if (!numAmount || numAmount <= 0) { setError('Masukkan jumlah yang valid'); return }

    if (loading) return
    setLoading(true); setError('')
    const supabase = createClient()
    // The parent closes the sheet and explains; without a handler, explain here.
    const goalGone = () => {
      setLoading(false)
      if (onGoalGone) { resetForm(); onGoalGone() } else setError(GOAL_GONE_MESSAGE)
    }

    // Overspend guard: check against the latest balance (the partner may have
    // just spent too), not the number rendered when the page loaded.
    if (type === 'withdrawal' && goalId) {
      const { data: goal, error: goalError } = await supabase
        .from('savings_goals').select('current_amount').eq('id', goalId).maybeSingle()
      if (goalError) { setError('Gagal cek saldo. Coba lagi ya.'); setLoading(false); return }
      if (!goal) { goalGone(); return }
      const available = Number(goal.current_amount)
      if (numAmount > available) {
        setError(available > 0
          ? `Saldo tabungan cuma ${fmtRpFull(available)}. Kurangi jumlah pengeluarannya ya.`
          : 'Saldo tabungan masih kosong, belum bisa mencatat pengeluaran.')
        setLoading(false)
        return
      }
    }

    const finalAmount = type === 'withdrawal' ? -numAmount : numAmount

    // The goal's current_amount is recomputed by a DB trigger from all of its
    // transactions — no client-side read-modify-write here.
    const { error: txError } = await supabase.from('couple_transactions').insert({
      couple_id: coupleId,
      goal_id: goalId,
      amount: finalAmount,
      type,
      category: type === 'deposit' ? 'tabungan' : category,
      note: note.trim() || null,
      created_by: userId,
    })

    if (txError) {
      // A deposit into a deleted goal is refused by RLS; say why instead of "no permission".
      if (goalId) {
        const { data: stillThere, error: checkError } = await supabase
          .from('savings_goals').select('id').eq('id', goalId).maybeSingle()
        if (!checkError && !stillThere) { goalGone(); return }
      }
      setError(transactionErrorMessage(txError, 'Gagal menyimpan transaksi. Coba lagi ya.')); setLoading(false); return
    }

    // Notify partner about the transaction (best-effort, never blocks the sheet)
    if (partnerId) {
      const numAmt = parseInt(amount.replace(/\D/g, ''), 10)
      const name = userName || 'Pasanganmu'
      const target = goalName || 'tabungan'
      const notifBody = type === 'deposit'
        ? `${name} menambahkan ${fmtRpNotif(numAmt)} ke ${target}`
        : `${name} mencatat pengeluaran ${fmtRpNotif(numAmt)}${note ? ` — ${note}` : ''}`

      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          title: 'Nanti Kita',
          body: notifBody,
          url: '/app/finance',
          kind: 'activity',
        }),
      }).catch(() => { /* optional */ })
    }

    setLoading(false)
    resetForm()
    onSuccess()
    onClose()
  }

  return (
    <Modal open={isOpen} onClose={() => { onClose(); resetForm() }} title="Tambah Transaksi">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div className="flex rounded-xl border border-border bg-cream p-1">
          <button
            type="button"
            onClick={() => { setType('deposit'); setCategory('tabungan') }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              type === 'deposit'
                ? 'bg-sage text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            Uang Masuk
          </button>
          <button
            type="button"
            onClick={() => { setType('withdrawal'); setCategory('lainnya') }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              type === 'withdrawal'
                ? 'bg-rose text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            Uang Keluar
          </button>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <label htmlFor="add-tx-amount" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Jumlah</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-ink-muted">Rp</span>
            <input
              id="add-tx-amount" type="text" inputMode="numeric" placeholder="0"
              value={amount}
              onChange={e => {
                const n = e.target.value.replace(/\D/g, '')
                setAmount(n ? parseInt(n, 10).toLocaleString('id-ID') : '')
              }}
              className="w-full rounded-2xl border border-border bg-white py-3.5 pl-12 pr-4 text-xl font-bold text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
              required
            />
          </div>
          <div className="flex gap-1.5">
            {QUICK_AMOUNTS.map(amt => (
              <button key={amt} type="button"
                onClick={() => setAmount(amt.toLocaleString('id-ID'))}
                className="flex-1 rounded-lg bg-cream py-1.5 text-xs font-semibold text-ink-muted hover:bg-rose-50 hover:text-rose transition-colors">
                {fmtQuick(amt)}
              </button>
            ))}
          </div>
          {type === 'withdrawal' && balance != null && (
            <p className="text-xs text-ink-muted">Saldo tabungan: <span className="font-semibold text-ink">{fmtRpFull(balance)}</span></p>
          )}
        </div>

        {/* Category (withdrawal only) */}
        {type === 'withdrawal' && (
          <div className="space-y-1.5">
            <p id="add-tx-category" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Kategori</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="add-tx-category">
              {WITHDRAWAL_CATEGORIES.map(cat => (
                <button key={cat.value} type="button"
                  onClick={() => setCategory(cat.value)}
                  aria-pressed={category === cat.value}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat.value
                      ? 'border-rose bg-rose-50 text-rose'
                      : 'border-border text-ink-muted hover:border-rose'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div className="space-y-1">
          <label htmlFor="add-tx-note" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Catatan</label>
          <input id="add-tx-note" type="text"
            placeholder={type === 'deposit' ? 'Contoh: Gaji bulan April' : 'Contoh: Makan malam anniversary'}
            value={note} onChange={e => setNote(e.target.value)}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <Button type="submit" loading={loading} size="lg">
          {type === 'deposit' ? 'Tambah Tabungan' : 'Catat Pengeluaran'}
        </Button>
      </form>
    </Modal>
  )
}
