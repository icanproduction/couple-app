'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2, Check, Edit2, ChevronDown, ChevronUp,
  Heart, Calculator, TrendingUp, CheckCircle,
} from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'

interface BudgetItem {
  id: string
  category: string
  name: string
  estimated_cost: number
  actual_cost: number | null
  is_paid: boolean
  notes: string | null
  sort_order: number
}

const CATEGORIES = [
  { value: 'venue', label: '🏛️ Venue & decor' },
  { value: 'catering', label: '🍽️ Catering' },
  { value: 'attire', label: '👗 Outfits & MUA' },
  { value: 'photo', label: '📸 Photo & video' },
  { value: 'music', label: '🎵 Entertainment & MC' },
  { value: 'invitation', label: '💌 Invitations & souvenirs' },
  { value: 'ceremony', label: '💍 Wedding ceremony' },
  { value: 'transport', label: '🚗 Transportation' },
  { value: 'honeymoon', label: '✈️ Honeymoon' },
  { value: 'other', label: '📦 Other' },
]

function fmtRp(n: number): string {
  return `Rp ${Math.abs(n).toLocaleString('id-ID')}`
}
function fmtInput(val: string): string {
  const num = val.replace(/\D/g, '')
  return num ? parseInt(num, 10).toLocaleString('id-ID') : ''
}
function parseRp(val: string): number { return parseInt(val.replace(/\D/g, ''), 10) || 0 }

export default function WeddingPlannerPage() {
  const router = useRouter()
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addCategory, setAddCategory] = useState('venue')
  const [addName, setAddName] = useState('')
  const [addEstimated, setAddEstimated] = useState('')
  const [addActual, setAddActual] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEstimated, setEditEstimated] = useState('')
  const [editActual, setEditActual] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Collapsed categories
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Errors + inline delete confirm
  const [addError, setAddError] = useState('')
  const [editError, setEditError] = useState('')
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }

    const { data: membership } = await supabase.from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) { setLoading(false); return }
    setCoupleId(membership.couple_id)

    const { data } = await supabase
      .from('wedding_budget_items')
      .select('*')
      .eq('couple_id', membership.couple_id)
      .order('sort_order')
      .order('created_at')

    setItems((data ?? []) as BudgetItem[])
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!coupleId || !addName.trim() || saving) return
    setSaving(true); setAddError('')
    const supabase = createClient()
    const { error } = await supabase.from('wedding_budget_items').insert({
      couple_id: coupleId,
      category: addCategory,
      name: addName.trim(),
      estimated_cost: parseRp(addEstimated),
      actual_cost: addActual ? parseRp(addActual) : null,
      notes: addNotes.trim() || null,
      sort_order: items.length,
    })
    setSaving(false)
    // Keep what was typed when the save fails
    if (error) { setAddError("Couldn't add the item. Try again."); return }
    setAddName(''); setAddEstimated(''); setAddActual(''); setAddNotes('')
    setShowAdd(false); loadData()
  }

  async function handleSaveEdit() {
    if (!editId || editSaving) return
    setEditSaving(true); setEditError('')
    const supabase = createClient()
    const { error } = await supabase.from('wedding_budget_items').update({
      name: editName.trim(),
      estimated_cost: parseRp(editEstimated),
      actual_cost: editActual ? parseRp(editActual) : null,
      notes: editNotes.trim() || null,
    }).eq('id', editId)
    setEditSaving(false)
    if (error) { setEditError("Couldn't save the item. Try again."); return }
    setEditId(null); loadData()
  }

  async function togglePaid(item: BudgetItem) {
    setRowError(null)
    const supabase = createClient()
    const { error } = await supabase.from('wedding_budget_items').update({ is_paid: !item.is_paid }).eq('id', item.id)
    if (error) { setRowError({ id: item.id, message: "Couldn't update the item. Try again." }); return }
    loadData()
  }

  async function deleteItem(id: string) {
    setRowError(null)
    const supabase = createClient()
    const { error } = await supabase.from('wedding_budget_items').delete().eq('id', id)
    setConfirmDeleteId(null)
    if (error) { setRowError({ id, message: "Couldn't delete the item. Try again." }); return }
    loadData()
  }

  function startEdit(item: BudgetItem) {
    setEditError('')
    setEditId(item.id)
    setEditName(item.name)
    setEditEstimated(item.estimated_cost.toLocaleString('id-ID'))
    setEditActual(item.actual_cost?.toLocaleString('id-ID') ?? '')
    setEditNotes(item.notes ?? '')
  }

  // Group by category
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0)

  // Totals
  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated_cost), 0)
  const totalActual = items.reduce((s, i) => s + Number(i.actual_cost ?? i.estimated_cost), 0)
  const totalPaid = items.filter(i => i.is_paid).reduce((s, i) => s + Number(i.actual_cost ?? i.estimated_cost), 0)
  const totalUnpaid = totalActual - totalPaid
  const paidCount = items.filter(i => i.is_paid).length
  const diff = totalActual - totalEstimated

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  if (!coupleId) {
    return (
      <div className="animate-fade-in flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/10">
          <Heart className="h-8 w-8 text-rose" />
        </div>
        <h1 className="text-xl font-bold text-ink">Wedding Planner</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-muted">Connect with your partner first to plan your wedding budget together.</p>
        <button onClick={() => router.push('/app/profile')}
          className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated">
          Invite your partner
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-8">
      {/* Header */}
      <div className="border-b border-border bg-white px-6 py-5">
        <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Money
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose/10">
            <Heart className="h-5 w-5 text-rose" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Wedding Planner</h1>
            <p className="text-sm text-ink-muted">Work out your wedding costs together</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-5">
        <div className="rounded-2xl bg-gradient-to-br from-rose to-rose-dark p-4 text-white">
          <p className="text-[10px] font-medium text-white/70">Estimated total</p>
          <p className="mt-0.5 text-lg font-extrabold">{fmtRp(totalEstimated)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-[10px] font-medium text-ink-muted">Actual</p>
          <p className="mt-0.5 text-lg font-extrabold text-ink">{fmtRp(totalActual)}</p>
          {diff !== 0 && (
            <p className={`text-[10px] font-semibold ${diff > 0 ? 'text-red-500' : 'text-sage-dark'}`}>
              {diff > 0 ? `+${fmtRp(diff)} over` : `-${fmtRp(Math.abs(diff))} under`}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-sage/30 bg-sage/5 p-4">
          <p className="text-[10px] font-medium text-ink-muted">Paid</p>
          <p className="mt-0.5 text-lg font-extrabold text-sage-dark">{fmtRp(totalPaid)}</p>
          <p className="text-[10px] text-ink-muted">{paidCount}/{items.length} {items.length === 1 ? 'item' : 'items'}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[10px] font-medium text-amber-700">Still to pay</p>
          <p className="mt-0.5 text-lg font-extrabold text-amber-800">{fmtRp(totalUnpaid)}</p>
        </div>
      </div>

      {/* Items by category */}
      <div className="mt-5 space-y-3 px-6">
        {grouped.map(group => {
          const isCollapsed = collapsed.has(group.value)
          const groupEst = group.items.reduce((s, i) => s + Number(i.estimated_cost), 0)
          const groupAct = group.items.reduce((s, i) => s + Number(i.actual_cost ?? i.estimated_cost), 0)

          return (
            <div key={group.value} className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
              <button
                onClick={() => setCollapsed(prev => {
                  const next = new Set(prev)
                  isCollapsed ? next.delete(group.value) : next.add(group.value)
                  return next
                })}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{group.label}</span>
                  <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-ink-muted">{group.items.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ink-muted">{fmtRp(groupAct)}</span>
                  {isCollapsed ? <ChevronDown className="h-4 w-4 text-ink-muted" /> : <ChevronUp className="h-4 w-4 text-ink-muted" />}
                </div>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-gray-50 border-t border-border">
                  {group.items.map(item => (
                    <div key={item.id} className="px-4 py-3">
                      {editId === item.id ? (
                        // Edit mode
                        <div className="space-y-2">
                          <input value={editName} onChange={e => setEditName(e.target.value)} aria-label="Item name"
                            className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-rose focus:outline-none" />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Est</span>
                              <input value={editEstimated} onChange={e => setEditEstimated(fmtInput(e.target.value))} aria-label="Estimated cost"
                                className="w-full rounded-xl border border-border py-2 pl-10 pr-3 text-sm focus:border-rose focus:outline-none" inputMode="numeric" />
                            </div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Real</span>
                              <input value={editActual} onChange={e => setEditActual(fmtInput(e.target.value))} aria-label="Actual cost"
                                className="w-full rounded-xl border border-border py-2 pl-10 pr-3 text-sm focus:border-rose focus:outline-none" inputMode="numeric"
                                placeholder="Same as Est" />
                            </div>
                          </div>
                          <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes..." aria-label="Notes"
                            className="w-full rounded-xl border border-border px-3 py-2 text-xs focus:border-rose focus:outline-none" />
                          {editError && <p className="text-xs font-medium text-red-500">{editError}</p>}
                          <div className="flex gap-2">
                            <button onClick={handleSaveEdit} disabled={editSaving}
                              className="flex items-center gap-1 rounded-lg bg-rose px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                              <Check className="h-3 w-3" /> {editSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => { setEditId(null); setEditError('') }} className="text-xs text-ink-muted">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        // Display mode
                        <div className="flex items-start gap-3">
                          <button onClick={() => togglePaid(item)}
                            role="checkbox" aria-checked={!!item.is_paid}
                            aria-label={`${item.name} paid`}
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                              item.is_paid ? 'border-sage bg-sage text-white' : 'border-border'
                            }`}>
                            {item.is_paid && <Check className="h-3 w-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${item.is_paid ? 'text-ink-muted line-through' : 'text-ink'}`}>{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-ink-muted">Est: {fmtRp(Number(item.estimated_cost))}</span>
                              {item.actual_cost != null && (
                                <span className="text-xs font-semibold text-ink">Actual: {fmtRp(Number(item.actual_cost))}</span>
                              )}
                            </div>
                            {item.notes && <p className="mt-0.5 text-[10px] text-ink-muted/70">{item.notes}</p>}
                            {rowError?.id === item.id && (
                              <p className="mt-1 text-[10px] font-medium text-red-500">{rowError.message}</p>
                            )}
                            {confirmDeleteId === item.id && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-[11px] font-medium text-red-600">Delete this item?</span>
                                <button onClick={() => deleteItem(item.id)}
                                  className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">Delete</button>
                                <button onClick={() => setConfirmDeleteId(null)}
                                  className="text-[11px] text-ink-muted">Cancel</button>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`} className="p-1 text-ink-muted hover:text-ink"><Edit2 className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setConfirmDeleteId(item.id)} aria-label={`Delete ${item.name}`} className="p-1 text-ink-muted hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {items.length === 0 && !showAdd && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose/10">
              <Heart className="h-6 w-6 text-rose" />
            </div>
            <p className="text-sm font-semibold text-ink">No budget items yet</p>
            <p className="mt-1 text-xs text-ink-muted">Add the costs for your wedding, one item at a time</p>
          </div>
        )}

        {/* Add item form */}
        {showAdd ? (
          <form onSubmit={handleAdd} className="rounded-2xl border-2 border-rose/30 bg-rose/5 p-4 space-y-3">
            <p className="text-sm font-bold text-ink">Add item</p>
            <select value={addCategory} onChange={e => setAddCategory(e.target.value)} aria-label="Category"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Item name (e.g. reception venue)" aria-label="Item name"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none" required />
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Rp</span>
                <input value={addEstimated} onChange={e => setAddEstimated(fmtInput(e.target.value))}
                  placeholder="Estimate" aria-label="Estimated cost" inputMode="numeric"
                  className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-rose focus:outline-none" required />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Rp</span>
                <input value={addActual} onChange={e => setAddActual(fmtInput(e.target.value))}
                  placeholder="Actual (optional)" aria-label="Actual cost" inputMode="numeric"
                  className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-rose focus:outline-none" />
              </div>
            </div>
            <input value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs focus:border-rose focus:outline-none" />
            {addError && <p className="text-xs font-medium text-red-500">{addError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="flex-1 rounded-xl bg-rose py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {saving ? 'Saving...' : 'Add'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-ink-muted">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose/30 bg-white py-3.5 text-sm font-bold text-rose transition-all hover:bg-rose/5 active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Add item
          </button>
        )}
      </div>
    </div>
  )
}
