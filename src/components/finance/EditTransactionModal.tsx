'use client'

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { TransactionItem } from '@/components/app/TransactionList'
import {
  WITHDRAWAL_CATEGORIES, formatRupiahInput, parseRupiahInput, signedAmount,
  transactionErrorMessage, type TxType,
} from '@/lib/finance'

interface EditTransactionModalProps {
  /** The transaction being edited; null keeps the sheet closed */
  transaction: TransactionItem | null
  onClose: () => void
  /** Called after a successful save or delete (reload the goal + list) */
  onChanged: () => void
}

/**
 * Edit amount / note / category of one transaction, or delete it (F06).
 * Only amount, type, category and note are writable (column grants); the type
 * stays as recorded and the sign follows it. The DB refuses any change that
 * would leave the goal's balance below zero and says why.
 */
export default function EditTransactionModal({ transaction, onClose, onChanged }: EditTransactionModalProps) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('lainnya') // copy-ok: stored value
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!transaction) return
    setAmount(Math.abs(Number(transaction.amount)).toLocaleString('id-ID'))
    setNote(transaction.note ?? '')
    setCategory(transaction.type === 'withdrawal' ? (transaction.category ?? 'lainnya') : 'tabungan') // copy-ok: stored value
    setError(''); setConfirmDelete(false); setSaving(false); setDeleting(false)
  }, [transaction])

  if (!transaction) return null
  const type = transaction.type as TxType
  const isDeposit = type === 'deposit'
  const busy = saving || deleting

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!transaction || busy) return
    const num = parseRupiahInput(amount)
    if (num <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data, error: upError } = await supabase
      .from('couple_transactions')
      .update({
        amount: signedAmount(type, num),
        category: isDeposit ? 'tabungan' : category, // copy-ok: stored value
        note: note.trim() || null,
      })
      .eq('id', transaction.id)
      .select('id')
    setSaving(false)
    if (upError) { setError(transactionErrorMessage(upError)); return }
    if (!data?.length) { setError('This transaction no longer exists. Your partner may have just deleted it.'); onChanged(); return }
    onChanged(); onClose()
  }

  async function handleDelete() {
    if (!transaction || busy) return
    setDeleting(true); setError('')
    const supabase = createClient()
    const { data, error: delError } = await supabase
      .from('couple_transactions').delete().eq('id', transaction.id).select('id')
    setDeleting(false)
    if (delError) {
      setConfirmDelete(false)
      setError(transactionErrorMessage(delError, "Couldn't delete the transaction. Try again."))
      return
    }
    if (!data?.length) { setError('This transaction no longer exists.'); onChanged(); return }
    onChanged(); onClose()
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose() }} title="Edit transaction">
      <form onSubmit={handleSave} className="space-y-4">
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
          isDeposit ? 'bg-sage/10 text-sage-dark' : 'bg-rose/10 text-rose'
        }`}>
          {isDeposit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          {isDeposit ? 'Money in' : 'Money out'}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-tx-amount" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-ink-muted">Rp</span>
            <input
              id="edit-tx-amount" type="text" inputMode="numeric" value={amount}
              onChange={e => setAmount(formatRupiahInput(e.target.value))}
              className="w-full rounded-2xl border border-border bg-white py-3.5 pl-12 pr-4 text-xl font-bold text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
              required
            />
          </div>
        </div>

        {!isDeposit && (
          <div className="space-y-1.5">
            <p className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {WITHDRAWAL_CATEGORIES.map(cat => (
                <button key={cat.value} type="button" onClick={() => setCategory(cat.value)}
                  aria-pressed={category === cat.value}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat.value ? 'border-rose bg-rose-50 text-rose' : 'border-border text-ink-muted hover:border-rose'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="edit-tx-note" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Note</label>
          <input id="edit-tx-note" type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder={isDeposit ? 'e.g. April salary' : 'e.g. Anniversary dinner'}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={saving} disabled={deleting} size="lg">Save changes</Button>
      </form>

      {confirmDelete ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-sm font-semibold text-red-700">Delete this transaction?</p>
          <p className="mt-0.5 text-xs text-red-600/80">Your savings balance will be recalculated.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="flex-1 rounded-xl border border-border bg-white py-2.5 text-xs font-semibold text-ink-muted">
              Cancel
            </button>
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-bold text-white disabled:opacity-60">
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setConfirmDelete(true); setError('') }} disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-ink-muted/60 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" /> Delete transaction
        </button>
      )}
    </Modal>
  )
}
