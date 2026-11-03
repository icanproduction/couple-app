'use client'

import { useState } from 'react'
import { PiggyBank, Calendar, ArrowRight, Target, Home, Car, Plane, GraduationCap, Heart, Gift, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

interface SavingsWizardProps {
  coupleId: string
  userId: string
  /** Receives the new goal's id so the caller can select it */
  onComplete: (goalId?: string) => void
  /** Shown inside a sheet (extra goal): smaller header + a cancel link */
  embedded?: boolean
  onCancel?: () => void
}

const GOAL_PRESETS = [
  { icon: Heart, label: 'Wedding fund', color: 'bg-rose/10 text-rose' },
  { icon: Plane, label: 'Trip together', color: 'bg-blue-50 text-blue-600' },
  { icon: Home, label: 'House / down payment', color: 'bg-sage/10 text-sage-dark' },
  { icon: Car, label: 'Car / motorbike', color: 'bg-purple-50 text-purple-600' },
  { icon: Gift, label: 'Emergency fund', color: 'bg-amber-50 text-amber-600' },
  { icon: Sparkles, label: 'Other', color: 'bg-gray-100 text-ink-muted' },
]

function fmtInput(val: string): string {
  const num = val.replace(/\D/g, '')
  return num ? parseInt(num, 10).toLocaleString('id-ID') : ''
}
function parseRp(val: string): number { return parseInt(val.replace(/\D/g, ''), 10) || 0 }
function fmtRp(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}M`
  return `Rp ${n.toLocaleString('id-ID')}`
}

export default function SavingsWizard({ coupleId, userId, onComplete, embedded = false, onCancel }: SavingsWizardProps) {
  const [step, setStep] = useState<'pick' | 'detail'>('pick')
  const [goalName, setGoalName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [currentSavings, setCurrentSavings] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const parsedTarget = parseRp(targetAmount)
  const parsedSavings = parseRp(currentSavings)
  const remaining = Math.max(0, parsedTarget - parsedSavings)
  const monthsRemaining = targetDate
    ? Math.max(1, Math.ceil((new Date(targetDate).getTime() - Date.now()) / (30.44 * 86400000)))
    : null
  const monthlyNeeded = monthsRemaining ? Math.ceil(remaining / monthsRemaining) : null

  async function handleCreate() {
    if (!goalName.trim() || parsedTarget <= 0 || loading) return
    setLoading(true)
    setError('')
    const supabase = createClient()

    // current_amount is maintained by a DB trigger (sum of the goal's
    // transactions), so it is never written from here.
    const { data: goal, error: goalError } = await supabase.from('savings_goals').insert({
      couple_id: coupleId,
      name: goalName.trim(),
      target_amount: parsedTarget,
      target_date: targetDate || null,
    }).select('id').single()

    if (goalError || !goal) {
      setError("Couldn't create the goal. Try again.")
      setLoading(false)
      return
    }

    // The opening balance is a real deposit, so the trigger counts it and the
    // first later transaction doesn't wipe it.
    if (parsedSavings > 0) {
      const { error: txError } = await supabase.from('couple_transactions').insert({
        couple_id: coupleId,
        goal_id: goal.id,
        amount: parsedSavings,
        type: 'deposit',
        category: 'tabungan',
        note: 'Opening balance',
        created_by: userId,
      })
      if (txError) {
        // Roll back so a retry doesn't leave a goal with a missing balance
        await supabase.from('savings_goals').delete().eq('id', goal.id)
        setError("Couldn't record the opening balance. Try again.")
        setLoading(false)
        return
      }
    }

    setLoading(false)
    onComplete(goal.id)
  }

  // Step 1: Pick goal type
  if (step === 'pick') {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="text-center">
          {!embedded && (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
              <PiggyBank className="h-8 w-8 text-rose" />
            </div>
          )}
          <h2 className={embedded ? 'text-base font-bold text-ink' : 'text-xl font-extrabold text-ink'}>
            {embedded ? 'What else are you saving for?' : 'Create a savings goal'}
          </h2>
          {!embedded && <p className="mt-1 text-sm text-ink-muted">What are you two saving for?</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {GOAL_PRESETS.map(preset => {
            const Icon = preset.icon
            return (
              <button
                key={preset.label}
                onClick={() => {
                  setGoalName(preset.label === 'Other' ? '' : preset.label)
                  setStep('detail')
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-5 text-center transition-all hover:border-rose hover:shadow-card active:scale-[0.98]"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${preset.color}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-ink">{preset.label}</p>
              </button>
            )
          })}
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="w-full py-2 text-sm text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    )
  }

  // Step 2: Details
  return (
    <div className="animate-fade-in space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-extrabold text-ink">Goal details</h2>
        <p className="mt-1 text-sm text-ink-muted">Fill in your savings goal</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          <Target className="mr-1 inline h-3.5 w-3.5" /> Goal name
        </label>
        <input
          type="text"
          value={goalName}
          onChange={e => setGoalName(e.target.value)}
          placeholder="e.g. Wedding fund, house down payment"
          className="w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Target amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-muted">Rp</span>
          <input
            type="text"
            inputMode="numeric"
            value={targetAmount}
            onChange={e => setTargetAmount(fmtInput(e.target.value))}
            placeholder="100.000.000"
            className="w-full rounded-2xl border border-border bg-white py-3.5 pl-11 pr-4 text-lg font-bold text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          <Calendar className="mr-1 inline h-3.5 w-3.5" /> Target date (optional)
        </label>
        <input
          type="date"
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          className="w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-sm text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Saved so far (optional)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-muted">Rp</span>
          <input
            type="text"
            inputMode="numeric"
            value={currentSavings}
            onChange={e => setCurrentSavings(fmtInput(e.target.value))}
            placeholder="0"
            className="w-full rounded-2xl border border-border bg-white py-3.5 pl-11 pr-4 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
        </div>
      </div>

      {/* Preview */}
      {parsedTarget > 0 && (
        <div className="rounded-2xl border border-border bg-cream p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Target</span>
            <span className="font-bold text-ink">{fmtRp(parsedTarget)}</span>
          </div>
          {parsedSavings > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Already saved</span>
              <span className="font-bold text-sage-dark">{fmtRp(parsedSavings)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Still needed</span>
            <span className="font-bold text-rose">{fmtRp(remaining)}</span>
          </div>
          {monthlyNeeded != null && monthlyNeeded > 0 && (
            <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
              <span className="text-ink-muted">Per month</span>
              <span className="font-bold text-ink">{fmtRp(monthlyNeeded)}/mo ({monthsRemaining} {monthsRemaining === 1 ? 'month' : 'months'})</span>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Button onClick={handleCreate} loading={loading} size="lg" disabled={!goalName.trim() || parsedTarget <= 0}>
        <span className="flex items-center gap-2">
          Start saving <ArrowRight className="h-4 w-4" />
        </span>
      </Button>

      <button onClick={() => setStep('pick')} className="w-full py-2 text-sm text-ink-muted hover:text-ink">
        ← Back
      </button>
    </div>
  )
}
