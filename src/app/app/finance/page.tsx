'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Minus, TrendingUp, Pencil, ChevronRight, Heart,
  Sparkles, Award, ArrowDownLeft, ArrowUpRight, PiggyBank, AlertCircle,
} from 'lucide-react'
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useCoupleRealtime } from '@/lib/realtime'
import {
  fmtRpShort as fmtRp, fmtRpFull, formatRupiahInput as fmtInput, parseRupiahInput as parseRp, GOAL_GONE_MESSAGE,
} from '@/lib/finance'
import Link from 'next/link'
import SavingsWizard from '@/components/app/SavingsWizard'
import AddTransactionModal from '@/components/app/AddTransactionModal'
import TransactionList, { type TransactionItem } from '@/components/app/TransactionList'
import EditTransactionModal from '@/components/finance/EditTransactionModal'
import GoalSwitcher from '@/components/finance/GoalSwitcher'
import MonthlySummary from '@/components/finance/MonthlySummary'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface SavingsGoal {
  id: string; name: string; current_amount: number; target_amount: number
  target_date: string | null; created_at: string
}

const LIST_LIMIT = 20

/** No session, or the auth server rejected it (not a network failure) */
function isSignedOutError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429
}

// The selected goal is remembered per device and per couple (F07).
const goalStorageKey = (coupleId: string) => `nanti-kita:finance-goal:${coupleId}`
function readStoredGoal(coupleId: string): string | null {
  try { return window.localStorage.getItem(goalStorageKey(coupleId)) } catch { return null }
}
function writeStoredGoal(coupleId: string, goalId: string | null) {
  try {
    if (goalId) window.localStorage.setItem(goalStorageKey(coupleId), goalId)
    else window.localStorage.removeItem(goalStorageKey(coupleId))
  } catch { /* private mode / blocked storage */ }
}

export default function FinancePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState<string | null>(null)
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  /** Goal the "tambah transaksi" sheet writes into, fixed when it opens */
  const [addTxGoal, setAddTxGoal] = useState<{ id: string; name: string } | null>(null)
  const [addTxInitialType, setAddTxInitialType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [editingTx, setEditingTx] = useState<TransactionItem | null>(null)
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  /** Goal the edit modal saves to, fixed when it opens */
  const [editGoalId, setEditGoalId] = useState<string | null>(null)
  /** Shown above the page after the goal on screen turned out to be deleted */
  const [goalGoneNotice, setGoalGoneNotice] = useState(false)
  const [editName, setEditName] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Runs on mount, on every realtime change and when the app comes back to the
  // foreground. A failed run keeps what is on screen and offers a retry.
  const loadData = useCallback(async () => {
    const failed = () => { setLoadError('Gagal memuat tabungan. Cek koneksi lalu coba lagi.'); setLoading(false) }
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      // A network blip is not a logout: keep the page and offer a retry.
      if (!authError || isSignedOutError(authError)) router.replace('/auth/login')
      else failed()
      return
    }
    setUserId(user.id)

    // Get my name
    const { data: myProfile } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
    if (myProfile) setUserName(myProfile.name ?? null)

    const { data: membership, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (memberError) { failed(); return }
    if (!membership?.couple_id) { setCoupleId(null); setLoading(false); return }
    const cid = membership.couple_id
    setCoupleId(cid)

    // Partner name
    const { data: allMembers, error: membersError } = await supabase
      .from('couple_members').select('profile_id').eq('couple_id', cid).neq('profile_id', user.id)
    if (allMembers?.[0]) {
      setPartnerId(allMembers[0].profile_id)
      const { data: p } = await supabase.from('profiles').select('name').eq('id', allMembers[0].profile_id).maybeSingle()
      if (p) setPartnerName(p.name ?? null)
    } else if (!membersError) {
      setPartnerId(null); setPartnerName(null)
    }

    const [goalR, txR] = await Promise.all([
      supabase.from('savings_goals').select('*').eq('couple_id', cid).order('created_at'),
      supabase.from('couple_transactions').select('*').eq('couple_id', cid).order('created_at', { ascending: false }),
    ])
    if (goalR.error || txR.error) { failed(); return }

    const list = goalR.data ?? []
    setLoadError('')
    setGoals(list)
    setTransactions(txR.data ?? [])
    // Keep the current choice; else this device's last choice; else the first goal.
    setSelectedGoalId(prev => {
      const ids = list.map(g => g.id)
      if (prev && ids.includes(prev)) return prev
      const stored = readStoredGoal(cid)
      if (stored && ids.includes(stored)) return stored
      return ids[0] ?? null
    })
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])
  useCoupleRealtime(coupleId, ['couple_transactions', 'savings_goals'], loadData)

  const goal = goals.find(g => g.id === selectedGoalId) ?? goals[0] ?? null
  const goalTxs = goal ? transactions.filter(t => t.goal_id === goal.id) : []

  function selectGoal(id: string) {
    setSelectedGoalId(id)
    if (coupleId) writeStoredGoal(coupleId, id)
    setConfirmDelete(false); setDeleteError(''); setShowAllTx(false); setGoalGoneNotice(false)
  }

  async function handleGoalCreated(goalId?: string) {
    setNewGoalOpen(false)
    await loadData()
    if (goalId) selectGoal(goalId)
  }

  function openEditGoal() {
    if (!goal) return
    setEditGoalId(goal.id)
    setEditName(goal.name); setEditTarget(Number(goal.target_amount).toLocaleString('id-ID'))
    setEditDate(goal.target_date ?? ''); setEditError(''); setEditModalOpen(true)
  }

  /** The goal on screen was deleted elsewhere: say so and show what is left */
  function handleGoalGone() {
    setGoalGoneNotice(true); setConfirmDelete(false)
    loadData()
  }

  async function saveEditGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!editGoalId || editSaving) return
    if (!editName.trim()) { setEditError('Nama target belum diisi'); return }
    if (parseRp(editTarget) <= 0) { setEditError('Target jumlah harus lebih dari 0'); return }
    setEditSaving(true); setEditError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('savings_goals').update({
      name: editName.trim(), target_amount: parseRp(editTarget), target_date: editDate || null,
    }).eq('id', editGoalId).select('id')
    setEditSaving(false)
    // Keep the modal (and what was typed) open when the save fails
    if (error) { setEditError('Gagal menyimpan perubahan. Coba lagi ya.'); return }
    // 0 rows updated: the goal no longer exists
    if (!data?.length) { setEditModalOpen(false); handleGoalGone(); return }
    setEditModalOpen(false); loadData()
  }

  async function deleteGoal() {
    if (!goal || deleting) return
    setDeleting(true); setDeleteError('')
    const supabase = createClient()
    // One statement: the goal's transactions go with it (ON DELETE CASCADE).
    const { error: goalError } = await supabase.from('savings_goals').delete().eq('id', goal.id)
    setDeleting(false)
    if (goalError) { setDeleteError('Gagal menghapus target. Coba lagi ya.'); loadData(); return }
    setConfirmDelete(false)
    if (coupleId) writeStoredGoal(coupleId, null)
    setSelectedGoalId(null)
    loadData()
  }

  // Computed (selected goal only)
  const balance = goal ? Number(goal.current_amount) : 0
  const totalIn = goalTxs.filter(t => t.type === 'deposit').reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalOut = goalTxs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const monthsRemaining = goal?.target_date ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (30.44 * 86400000))) : null
  const targetAmount = goal ? Number(goal.target_amount) : 0
  const monthlyRequired = goal && monthsRemaining && monthsRemaining > 0 ? Math.ceil((targetAmount - balance) / monthsRemaining) : null
  // Bar width only — the balance itself is shown with its real sign
  const progressPercent = targetAmount > 0 ? Math.max(0, Math.min(100, Math.round((balance / targetAmount) * 100))) : 0
  const milestoneMsg = progressPercent >= 100 ? 'Target tercapai!' : progressPercent >= 75 ? 'Hampir sampai!' : progressPercent >= 50 ? 'Setengah jalan!' : progressPercent >= 25 ? 'Seperempat terkumpul!' : null
  const shownTxs = showAllTx ? goalTxs : goalTxs.slice(0, LIST_LIMIT)

  if (loading) {
    return <div className="flex items-center justify-center py-20" role="status" aria-label="Memuat tabungan"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  // ===== LOAD FAILED before anything was shown =====
  if (loadError && goals.length === 0) {
    return (
      <div className="animate-fade-in flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-rose/60" strokeWidth={1.5} />
        <p className="text-sm font-semibold text-ink">{loadError}</p>
        <button onClick={() => { setLoading(true); loadData() }}
          className="mt-4 rounded-2xl bg-rose px-6 py-3 text-sm font-bold text-white shadow-card active:scale-[0.98]">
          Coba lagi
        </button>
      </div>
    )
  }

  // ===== NO COUPLE: nothing to save into yet =====
  if (!coupleId || !userId) {
    return (
      <div className="animate-fade-in flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
          <PiggyBank className="h-8 w-8 text-rose" strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-bold text-ink">Tabungan Bersama</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
          Hubungkan akunmu dengan pasangan dulu, lalu kalian bisa nabung dan catat pengeluaran bareng di sini.
        </p>
        <Link href="/app/profile"
          className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated transition-all active:scale-[0.98]">
          Undang Pasangan
        </Link>
      </div>
    )
  }

  const goalGoneBanner = goalGoneNotice && (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-gold/10 px-3 py-2 text-sm text-yellow-800">
      <span>{GOAL_GONE_MESSAGE}</span>
      <button onClick={() => setGoalGoneNotice(false)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold hover:bg-gold/20">
        Oke
      </button>
    </div>
  )

  // ===== NO GOAL: Show wizard =====
  if (!goal) {
    return (
      <div className="space-y-4 px-6 py-6">
        {goalGoneBanner}
        <SavingsWizard coupleId={coupleId} userId={userId} onComplete={handleGoalCreated} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-8">
      {/* ===== GRADIENT HERO (selected goal) ===== */}
      <div className="relative overflow-hidden bg-gradient-to-br from-rose via-rose-dark to-[#d45a5a] px-6 pb-8 pt-6 text-white">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/70">Saldo · {goal.name}</p>
              <p className="mt-0.5 text-3xl font-extrabold tracking-tight">{fmtRpFull(balance)}</p>
            </div>
            <button onClick={openEditGoal} aria-label={`Ubah target ${goal.name}`} className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
              <Pencil className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* In/Out summary */}
          <div className="mt-3 flex gap-4">
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft className="h-3.5 w-3.5 text-white/70" />
              <span className="text-xs text-white/70">Masuk</span>
              <span className="text-xs font-bold text-white">{fmtRp(totalIn)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-white/70" />
              <span className="text-xs text-white/70">Keluar</span>
              <span className="text-xs font-bold text-white">{fmtRp(totalOut)}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-white/70">
              <span className="truncate">{goal.name}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/60">
              Target: {fmtRp(Number(goal.target_amount))}
              {monthsRemaining != null && monthsRemaining > 0 && ` • ${monthsRemaining}bln lagi`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 pt-5">
        {goalGoneBanner}
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            <span>{loadError}</span>
            <button onClick={() => { void loadData() }} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">
              Coba lagi
            </button>
          </div>
        )}

        {/* ===== GOALS (F07) ===== */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Target kalian ({goals.length})</p>
          <GoalSwitcher goals={goals} selectedId={goal.id} onSelect={selectGoal} onAdd={() => setNewGoalOpen(true)} />
        </div>

        {/* Monthly hint */}
        {monthlyRequired != null && monthlyRequired > 0 && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-gold/10 px-4 py-3">
            <TrendingUp className="h-5 w-5 flex-shrink-0 text-yellow-700" />
            <div>
              <p className="text-sm font-semibold text-yellow-800">{fmtRp(monthlyRequired)}<span className="font-normal">/bulan</span></p>
              <p className="text-xs text-yellow-700/70">untuk mencapai target tepat waktu</p>
            </div>
          </div>
        )}

        {/* Milestone */}
        {milestoneMsg && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-sage/10 px-4 py-3">
            {progressPercent >= 100 ? <Award className="h-5 w-5 text-sage-dark" /> : <Sparkles className="h-5 w-5 text-sage-dark" />}
            <p className="text-sm font-medium text-sage-dark">{milestoneMsg}</p>
          </div>
        )}

        {/* ACTION BUTTONS: Masuk / Keluar */}
        <div className="flex gap-3">
          <button
            onClick={() => { setAddTxInitialType('deposit'); setAddTxGoal({ id: goal.id, name: goal.name }) }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sage py-3.5 text-sm font-bold text-white shadow-card transition-all hover:bg-sage-dark active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Uang Masuk
          </button>
          <button
            onClick={() => { setAddTxInitialType('withdrawal'); setAddTxGoal({ id: goal.id, name: goal.name }) }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-rose/30 bg-white py-3.5 text-sm font-bold text-rose shadow-card transition-all hover:bg-rose-50 active:scale-[0.98]"
          >
            <Minus className="h-4 w-4" />
            Uang Keluar
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Saldo" value={fmtRp(balance)} icon={<TrendingUp className="h-3.5 w-3.5 text-rose" />} />
          <StatBox label="Masuk" value={fmtRp(totalIn)} icon={<ArrowDownLeft className="h-3.5 w-3.5 text-sage-dark" />} />
          <StatBox label="Keluar" value={fmtRp(totalOut)} icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose" />} />
        </div>

        {/* TRANSACTION HISTORY (selected goal) */}
        <div className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Riwayat Transaksi</h2>
            <span className="text-xs text-ink-muted">{goalTxs.length} transaksi</span>
          </div>
          <TransactionList
            transactions={shownTxs}
            userId={userId}
            partnerName={partnerName}
            userName={userName}
            onSelect={setEditingTx}
          />
          {goalTxs.length > LIST_LIMIT && (
            <div className="border-t border-border px-4 py-2 text-center">
              <button onClick={() => setShowAllTx(v => !v)} className="text-xs font-semibold text-rose hover:underline">
                {showAllTx ? 'Tampilkan lebih sedikit' : `Lihat semua ${goalTxs.length} transaksi`}
              </button>
            </div>
          )}
        </div>

        {/* MONTHLY SUMMARY (F10) */}
        <MonthlySummary
          transactions={transactions}
          selectedGoal={{ id: goal.id, name: goal.name }}
          goalCount={goals.length}
          userId={userId}
          userName={userName}
          partnerId={partnerId}
          partnerName={partnerName}
        />

        {/* Wedding planner link */}
        <Link href="/app/finance/wedding"
          className="flex items-center gap-4 rounded-2xl border border-rose/20 bg-rose/5 p-4 transition-all hover:bg-rose/10 active:scale-[0.98]">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose/10">
            <Heart className="h-5 w-5 text-rose" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">Wedding Planner</p>
            <p className="text-xs text-ink-muted">Hitung biaya nikah sendiri, item per item</p>
          </div>
          <ChevronRight className="h-4 w-4 text-rose" />
        </Link>

        {/* Delete selected goal (inline confirm) */}
        {confirmDelete ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700">Hapus target &ldquo;{goal.name}&rdquo; &amp; semua transaksinya?</p>
            <p className="mt-1 text-xs text-red-600/80">Riwayat tabungan ini akan hilang dan tidak bisa dikembalikan. Target lain tidak terpengaruh.</p>
            {deleteError && <p className="mt-2 text-xs font-medium text-red-600">{deleteError}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setConfirmDelete(false); setDeleteError('') }} disabled={deleting}
                className="flex-1 rounded-xl border border-border bg-white py-2.5 text-xs font-semibold text-ink-muted">
                Batal
              </button>
              <button onClick={deleteGoal} disabled={deleting}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-bold text-white disabled:opacity-60">
                {deleting ? 'Menghapus...' : 'Ya, hapus'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-1 text-center text-xs text-ink-muted/40 hover:text-red-400">
            Hapus target ini
          </button>
        )}

      </div>

      {/* Modals */}
      <AddTransactionModal
        isOpen={addTxGoal !== null} onClose={() => setAddTxGoal(null)}
        coupleId={coupleId} goalId={addTxGoal?.id ?? goal.id} userId={userId}
        userName={userName} partnerId={partnerId} goalName={addTxGoal?.name ?? goal.name}
        onSuccess={loadData} initialType={addTxInitialType}
        balance={addTxGoal?.id === goal.id ? balance : null}
        onGoalGone={() => { setAddTxGoal(null); handleGoalGone() }}
      />

      <EditTransactionModal transaction={editingTx} onClose={() => setEditingTx(null)} onChanged={loadData} />

      <Modal open={newGoalOpen} onClose={() => setNewGoalOpen(false)} title="Target Baru" className="max-h-[92vh] overflow-y-auto">
        <SavingsWizard coupleId={coupleId} userId={userId} embedded
          onComplete={handleGoalCreated} onCancel={() => setNewGoalOpen(false)} />
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Ubah Target">
        <form onSubmit={saveEditGoal} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="goal-name" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Nama target</label>
            <input id="goal-name" type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nama target"
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" required />
          </div>
          <div className="space-y-1">
            <label htmlFor="goal-target" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Target jumlah</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">Rp</span>
              <input id="goal-target" type="text" inputMode="numeric" value={editTarget} onChange={e => setEditTarget(fmtInput(e.target.value))}
                className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-4 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" required />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="goal-date" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Target tanggal (opsional)</label>
            <input id="goal-date" type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          </div>
          {editError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</p>}
          <Button type="submit" loading={editSaving} size="lg">Simpan</Button>
        </form>
      </Modal>
    </div>
  )
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-white px-3 py-3 shadow-card">
      {icon}
      <p className="text-sm font-bold text-ink">{value}</p>
      <p className="text-[10px] text-ink-muted">{label}</p>
    </div>
  )
}
