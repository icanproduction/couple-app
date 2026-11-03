'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, ListChecks, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import {
  BUCKET_CATEGORIES, BUCKET_NOTE_MAX, BUCKET_TITLE_MAX, bucketProgress, categoryInfo, createBucketItem,
  deleteBucketItem, listBucketItems, momentPrefillHref, setBucketDone, updateBucketItem, validateBucketInput,
  type BucketCategory, type BucketItem,
} from '@/lib/bucket'
import { cn, formatRupiah } from '@/lib/utils'

type Tab = 'belum' | 'sudah'

interface FormState {
  title: string
  note: string
  category: BucketCategory
  /** Digits only */
  cost: string
}

const EMPTY_FORM: FormState = { title: '', note: '', category: 'petualangan', cost: '' }

export default function BucketListPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nocouple' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [items, setItems] = useState<BucketItem[]>([])
  const [tab, setTab] = useState<Tab>('belum')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BucketItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<BucketItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [celebrate, setCelebrate] = useState<BucketItem | null>(null)

  useEffect(() => {
    let cancelled = false
    getCoupleInfo()
      .then((i) => {
        if (cancelled) return
        if (!i) { router.replace('/auth/login'); return }
        if (!i.coupleId) { setStatus('nocouple'); return }
        setInfo(i)
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [router, attempt])

  const load = useCallback(async () => {
    if (!info?.coupleId) return
    try {
      setItems(await listBucketItems(createClient(), info.coupleId))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [info])

  useEffect(() => { load() }, [load])
  useCoupleRealtime(info?.coupleId, ['bucket_items'], load)

  const pending = items.filter((i) => !i.is_done)
  const done = items
    .filter((i) => i.is_done)
    .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at))
  const progress = bucketProgress(items)
  const visible = tab === 'belum' ? pending : done

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(item: BucketItem) {
    setEditing(item)
    setForm({
      title: item.title,
      note: item.note ?? '',
      category: categoryInfo(item.category).key,
      cost: item.estimated_cost != null ? String(Math.round(Number(item.estimated_cost))) : '',
    })
    setFormError('')
    setFormOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!info?.coupleId || saving) return
    const input = {
      title: form.title,
      note: form.note || null,
      category: form.category,
      estimated_cost: form.cost ? Number(form.cost) : null,
    }
    const invalid = validateBucketInput(input)
    if (invalid) { setFormError(invalid); return }
    setSaving(true)
    setFormError('')
    try {
      const client = createClient()
      const saved = editing
        ? await updateBucketItem(client, editing.id, input)
        : await createBucketItem(client, info.coupleId, info.userId, input)
      setItems((prev) => (editing ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev]))
      if (!editing) setTab('belum')
      setFormOpen(false)
    } catch {
      setFormError(editing ? 'Perubahan belum tersimpan. Coba lagi ya.' : 'Belum berhasil ditambahkan. Coba lagi ya.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleDone(item: BucketItem) {
    if (busyId) return
    setBusyId(item.id)
    setActionError('')
    try {
      const saved = await setBucketDone(createClient(), item.id, !item.is_done)
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
      if (saved.is_done && !saved.moment_id) setCelebrate(saved)
    } catch {
      setActionError('Gagal memperbarui. Coba lagi ya.')
    } finally {
      setBusyId(null)
    }
  }

  async function doDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    try {
      await deleteBucketItem(createClient(), confirmDelete.id)
      setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id))
      setConfirmDelete(null)
      load() // deletes aren't delivered by realtime
    } catch {
      setActionError('Gagal menghapus. Coba lagi ya.')
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="border-b border-border bg-white px-6 pb-5 pt-6">
        <Link href="/app/jelajah" className="mb-3 flex w-fit items-center gap-1 text-sm text-ink-muted">
          <ArrowLeft className="h-4 w-4" /> Jelajah
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Bucket List</h1>
            <p className="text-sm text-ink-muted">
              {progress.total > 0 ? `${progress.done} dari ${progress.total} tercapai` : 'Hal-hal yang mau kalian coba berdua'}
            </p>
          </div>
          {status === 'ready' && (
            <button
              onClick={openCreate}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-rose px-4 py-2.5 text-xs font-bold text-white shadow-elevated active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Tambah
            </button>
          )}
        </div>
        {status === 'ready' && progress.total > 0 && (
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-cream"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Progres bucket list"
          >
            <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <div className="space-y-3 px-6 pt-5">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-rose-50" />)}
        </div>
      ) : status === 'nocouple' ? (
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Hubungkan akunmu dengan pasangan dulu untuk mulai bikin bucket list.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Profil</Link>
        </div>
      ) : status === 'error' && items.length === 0 ? (
        <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-sm text-red-600">Gagal memuat bucket list.</p>
          <button
            onClick={() => { setStatus('loading'); if (info) load(); else setAttempt((n) => n + 1) }}
            className="flex items-center gap-1 text-xs font-semibold text-red-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sage/15">
            <ListChecks className="h-8 w-8 text-sage-dark" />
          </div>
          <h2 className="text-lg font-bold text-ink">Bucket list masih kosong</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Tulis hal-hal yang mau kalian lakukan berdua, dari kuliner baru sampai liburan impian.
          </p>
          <button
            onClick={openCreate}
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Tambah Impian Pertama
          </button>
          <Link href="/app/ide-date" className="mt-3 text-sm font-semibold text-rose">Atau minta ide date dari AI</Link>
        </div>
      ) : (
        <div className="px-6 pt-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-cream p-1" role="tablist" aria-label="Status bucket list">
            {(['belum', 'sudah'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-xl py-2 text-sm font-semibold transition-colors',
                  tab === t ? 'bg-white text-ink shadow-card' : 'text-ink-muted'
                )}
              >
                {t === 'belum' ? `Belum (${pending.length})` : `Sudah (${done.length})`}
              </button>
            ))}
          </div>

          {actionError && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm text-ink-muted">
                {tab === 'belum'
                  ? 'Semua sudah tercapai! Saatnya tambah impian baru.'
                  : 'Belum ada yang tercapai. Yuk wujudkan satu!'}
              </p>
              {tab === 'belum' && (
                <button onClick={openCreate} className="mt-3 text-sm font-semibold text-rose">Tambah impian</button>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((item) => (
                <BucketRow
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onToggle={() => toggleDone(item)}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setConfirmDelete(item)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add / edit */}
      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? 'Edit Bucket List' : 'Tambah Bucket List'}>
        <form onSubmit={submitForm} className="max-h-[65vh] space-y-4 overflow-y-auto pb-1">
          <div>
            <label htmlFor="bucket-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Mau ngapain?
            </label>
            <input
              id="bucket-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, BUCKET_TITLE_MAX) }))}
              maxLength={BUCKET_TITLE_MAX}
              placeholder="Contoh: Lihat sunrise di Bromo"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10"
            />
            <p className="mt-1 text-right text-[11px] text-ink-muted">{form.title.length}/{BUCKET_TITLE_MAX}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Kategori</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Kategori">
              {BUCKET_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={form.category === c.key}
                  onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    form.category === c.key ? 'border-rose bg-rose/10 text-rose' : 'border-border bg-white text-ink-light'
                  )}
                >
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="bucket-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Catatan (opsional)
            </label>
            <textarea
              id="bucket-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value.slice(0, BUCKET_NOTE_MAX) }))}
              maxLength={BUCKET_NOTE_MAX}
              rows={3}
              placeholder="Detail, tempat, atau alasan kenapa pengin"
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10"
            />
          </div>

          <div>
            <label htmlFor="bucket-cost" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Perkiraan biaya (opsional)
            </label>
            <div className="flex items-center rounded-2xl border border-border bg-surface px-4 focus-within:border-rose focus-within:ring-2 focus-within:ring-rose/10">
              <span className="text-sm text-ink-muted">Rp</span>
              <input
                id="bucket-cost"
                inputMode="numeric"
                value={form.cost ? Number(form.cost).toLocaleString('id-ID') : ''}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13) }))}
                placeholder="0"
                className="w-full bg-transparent px-2 py-3.5 text-sm text-ink outline-none placeholder:text-ink-muted/60"
              />
            </div>
          </div>

          {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}

          <Button type="submit" loading={saving} disabled={!form.title.trim()}>
            {editing ? 'Simpan Perubahan' : 'Tambahkan'}
          </Button>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => !deleting && setConfirmDelete(null)} title="Hapus dari bucket list?">
        <p className="mb-5 text-sm text-ink-light">
          “{confirmDelete?.title}” akan dihapus untuk kalian berdua.
          {confirmDelete?.moment_id ? ' Moment yang sudah tersimpan tetap ada.' : ''}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Batal</Button>
          <Button variant="danger" onClick={doDelete} loading={deleting}>Hapus</Button>
        </div>
      </Modal>

      {/* Done → offer a Moment */}
      <Modal open={!!celebrate} onClose={() => setCelebrate(null)}>
        {celebrate && (
          <div className="text-center">
            <p className="text-4xl" aria-hidden>🎉</p>
            <h3 className="mt-2 text-lg font-bold text-ink">Yeay, tercapai!</h3>
            <p className="mt-1 text-sm text-ink-light">
              “{celebrate.title}” sudah kalian centang. Mau diabadikan jadi Moment, lengkap dengan foto dan ceritanya?
            </p>
            <div className="mt-5 space-y-2">
              <Link
                href={momentPrefillHref(celebrate)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
              >
                <Camera className="h-4 w-4" /> Abadikan jadi Moment
              </Link>
              <Button variant="ghost" onClick={() => setCelebrate(null)}>Nanti saja</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function BucketRow({
  item, busy, onToggle, onEdit, onDelete,
}: {
  item: BucketItem
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = categoryInfo(item.category)
  const cost = item.estimated_cost != null ? Number(item.estimated_cost) : null
  return (
    <li className={cn('rounded-2xl border border-border bg-white p-4 shadow-card', item.is_done && 'bg-sage/5')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-label={item.is_done ? `Tandai belum tercapai: ${item.title}` : `Tandai tercapai: ${item.title}`}
          aria-pressed={item.is_done}
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50',
            item.is_done ? 'border-sage bg-sage text-white' : 'border-border bg-white text-transparent hover:border-sage'
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          {/* Actions sit on the chip row so the title gets the card's full width */}
          <div className="flex items-center gap-1.5">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink-light">
              <span aria-hidden>{cat.emoji}</span> {cat.label}
            </span>
            {item.source === 'ai' && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">
                <Sparkles className="h-3 w-3" /> Ide AI
              </span>
            )}
            <div className="-my-1.5 -mr-2 ml-auto flex shrink-0">
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${item.title}`}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted hover:bg-cream hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Hapus ${item.title}`}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-danger hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className={cn('mt-1.5 break-words font-bold', item.is_done ? 'text-ink-light' : 'text-ink')}>{item.title}</p>
          {item.note && <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-muted">{item.note}</p>}
          {cost !== null && cost > 0 && <p className="mt-1 text-xs text-ink-light">Perkiraan {formatRupiah(cost)}</p>}

          {item.is_done && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.done_at && (
                <span className="text-xs font-medium text-sage-dark">
                  Tercapai {formatDateID(todayJakarta(new Date(item.done_at)))}
                </span>
              )}
              {item.moment_id ? (
                <Link href={`/app/moments/${item.moment_id}`} className="flex items-center gap-1 text-xs font-semibold text-rose">
                  <Camera className="h-3.5 w-3.5" /> Lihat Moment
                </Link>
              ) : (
                <Link href={momentPrefillHref(item)} className="flex items-center gap-1 text-xs font-semibold text-rose">
                  <Camera className="h-3.5 w-3.5" /> Abadikan jadi Moment
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
