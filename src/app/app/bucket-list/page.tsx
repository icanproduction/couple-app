'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Link2, ListChecks, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { formatDateID, todayJakarta } from '@/lib/dates'
import { getCoupleInfo, type CoupleInfo } from '@/lib/moments'
import { useCoupleRealtime } from '@/lib/realtime'
import {
  BUCKET_CATEGORIES, BUCKET_LINK_MAX, BUCKET_NOTE_MAX, BUCKET_TITLE_MAX, BucketPictureConflictError, bucketProgress,
  categoryInfo, deleteBucketItem, linkLabel, listBucketItems, momentPrefillHref, normalizeReferenceUrl,
  saveBucketItem, setBucketDone, validateBucketInput,
  type BucketCategory, type BucketItem, type PictureChange,
} from '@/lib/bucket'
import { cn, formatRupiah } from '@/lib/utils'
import { LinkChip, PictureField, PictureViewer, SignedImg, type FormPicture } from './parts'
import { PictureError, forgetPictures, preparePicture, signPictures, uploadWithProgress } from './pictures'

type Tab = 'belum' | 'sudah'

interface FormState {
  title: string
  note: string
  category: BucketCategory
  /** Digits only */
  cost: string
  /** As typed or pasted; normalised on blur and on save */
  link: string
}

const EMPTY_FORM: FormState = { title: '', note: '', category: 'petualangan', cost: '', link: '' }

/** What the save step sends for the form's picture state. */
function pictureChange(p: FormPicture): PictureChange {
  return p.kind === 'set' ? { kind: 'set', blob: p.blob } : p
}

export default function BucketListPage() {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nocouple' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [items, setItems] = useState<BucketItem[]>([])
  const [tab, setTab] = useState<Tab>('belum') // copy-ok: internal tab key, never shown
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BucketItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [saving, setSaving] = useState(false)
  const [picture, setPicture] = useState<FormPicture>({ kind: 'keep' })
  const [preparing, setPreparing] = useState(false)
  const [pictureError, setPictureError] = useState('')
  /** Upload progress 0..100 while a picture is being sent, else null */
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  // Bumped each time the form opens, so a slow picture prep from a closed
  // form can't land in the next one.
  const formSession = useRef(0)

  // Signed URLs by storage path; `signing` counts the batches still out
  // (a live reload can start one while another is running)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [signing, setSigning] = useState(0)
  const [viewing, setViewing] = useState<BucketItem | null>(null)
  // Synchronous double-submit guard (state updates land a render later)
  const savingRef = useRef(false)

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

  /** Signs the pictures that have no URL yet; a failure only affects the pictures. */
  const signFor = useCallback(async (list: BucketItem[]) => {
    const paths = list.flatMap((i) => (i.image_path ? [i.image_path] : []))
    if (paths.length === 0) return
    setSigning((n) => n + 1)
    try {
      const signed = await signPictures(paths)
      setUrls((prev) => ({ ...prev, ...signed }))
    } catch {
      // Thumbnails show "unavailable"; the viewer offers Try again, and the
      // next reload (live update, app back in front) signs them again.
    } finally {
      setSigning((n) => n - 1)
    }
  }, [])

  const load = useCallback(async () => {
    if (!info?.coupleId) return
    try {
      const list = await listBucketItems(createClient(), info.coupleId)
      setItems(list)
      setStatus('ready')
      signFor(list)
    } catch {
      setStatus('error')
    }
  }, [info, signFor])

  useEffect(() => { load() }, [load])
  useCoupleRealtime(info?.coupleId, ['bucket_items'], load)

  /** undefined while signing, null when there is no usable URL */
  const urlFor = (path: string | null) => (path ? urls[path] ?? (signing > 0 ? undefined : null) : null)
  const closeViewer = useCallback(() => setViewing(null), [])

  // A picked picture's preview is an object URL: free it when it's replaced or the form closes.
  const previewUrl = picture.kind === 'set' ? picture.preview : null
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  // The viewer follows live updates: a removed picture or item closes it.
  const viewingNow = viewing ? items.find((i) => i.id === viewing.id && i.image_path) ?? null : null
  useEffect(() => {
    if (viewing && !viewingNow) setViewing(null)
  }, [viewing, viewingNow])

  const pending = items.filter((i) => !i.is_done)
  const done = items
    .filter((i) => i.is_done)
    .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at))
  const progress = bucketProgress(items)
  const visible = tab === 'belum' ? pending : done

  function resetFormExtras() {
    formSession.current += 1
    setFormError('')
    setLinkError('')
    setPicture({ kind: 'keep' })
    setPreparing(false)
    setPictureError('')
    setUploadPct(null)
  }

  function openCreate() {
    resetFormExtras()
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(item: BucketItem) {
    resetFormExtras()
    setEditing(item)
    setForm({
      title: item.title,
      note: item.note ?? '',
      category: categoryInfo(item.category).key,
      cost: item.estimated_cost != null ? String(Math.round(Number(item.estimated_cost))) : '',
      link: item.reference_url ?? '',
    })
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    formSession.current += 1
    setFormOpen(false)
    setPicture({ kind: 'keep' })
    setPreparing(false)
  }

  /** Shows the cleaned-up link (https:// added, share text dropped) or what is wrong with it. */
  function checkLink(): { ok: boolean; url: string | null } {
    const result = normalizeReferenceUrl(form.link)
    if (result.error) { setLinkError(result.error); return { ok: false, url: null } }
    setLinkError('')
    if ((result.url ?? '') !== form.link) setForm((f) => ({ ...f, link: result.url ?? '' }))
    return { ok: true, url: result.url }
  }

  async function pickPicture(file: File) {
    const session = formSession.current
    setPictureError('')
    setPreparing(true)
    try {
      const prepared = await preparePicture(file)
      if (session !== formSession.current) { URL.revokeObjectURL(prepared.preview); return }
      setPicture({ kind: 'set', blob: prepared.blob, preview: prepared.preview })
    } catch (err) {
      if (session !== formSession.current) return
      setPictureError(err instanceof PictureError ? err.message : "Couldn't prepare that picture. Try another one.")
    } finally {
      if (session === formSession.current) setPreparing(false)
    }
  }

  function removePicture() {
    setPictureError('')
    // A new pick on top of an existing picture: removing it means "no picture".
    setPicture(editing?.image_path ? { kind: 'remove' } : { kind: 'keep' })
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!info?.coupleId || saving || savingRef.current || preparing) return
    const link = checkLink()
    if (!link.ok) return
    const input = {
      title: form.title,
      note: form.note || null,
      category: form.category,
      estimated_cost: form.cost ? Number(form.cost) : null,
      reference_url: link.url,
    }
    const invalid = validateBucketInput(input)
    if (invalid) { setFormError(invalid); return }
    const uploading = picture.kind === 'set'
    if (uploading && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFormError("You're offline. Connect to the internet and try again, or remove the picture.")
      return
    }
    savingRef.current = true
    setSaving(true)
    setFormError('')
    setUploadPct(uploading ? 0 : null)
    const replaced = editing?.image_path ?? null
    try {
      const client = createClient()
      const saved = await saveBucketItem(client, {
        coupleId: info.coupleId,
        userId: info.userId,
        existing: editing ? { id: editing.id, image_path: editing.image_path } : null,
        input,
        picture: pictureChange(picture),
        upload: uploadWithProgress((fraction) => {
          const pct = Math.round(fraction * 100)
          setUploadPct((prev) => (prev === pct ? prev : pct))
        }),
      })
      if (replaced && replaced !== saved.image_path) forgetPictures([replaced])
      if (saved.image_path && !urls[saved.image_path]) {
        // One quick request so the new thumbnail shows right away.
        const signed = await signPictures([saved.image_path]).catch(() => ({}))
        setUrls((prev) => ({ ...prev, ...signed }))
      }
      setItems((prev) => (editing ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev]))
      if (!editing) setTab('belum') // copy-ok: internal tab key, never shown
      formSession.current += 1
      setFormOpen(false)
      setPicture({ kind: 'keep' })
    } catch (err) {
      if (err instanceof BucketPictureConflictError && editing) {
        await recoverFromConflict(editing.id, err.message)
      } else if (err instanceof PictureError) {
        setFormError(err.message)
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setFormError("You're offline. Connect to the internet and try again.")
      } else {
        setFormError(editing ? "Couldn't save your changes. Try again." : "Couldn't add it. Try again.")
      }
    } finally {
      savingRef.current = false
      setSaving(false)
      setUploadPct(null)
    }
  }

  /**
   * The picture changed (or the item went) on the partner's phone while this
   * form was open. Reload, and keep the form on the latest version so saving
   * again works; nothing was written by the failed save.
   */
  async function recoverFromConflict(itemId: string, message: string) {
    if (!info?.coupleId) return
    try {
      const list = await listBucketItems(createClient(), info.coupleId)
      setItems(list)
      signFor(list)
      const fresh = list.find((i) => i.id === itemId)
      if (fresh) {
        setEditing(fresh)
        setFormError(message)
      } else {
        formSession.current += 1
        setFormOpen(false)
        setPicture({ kind: 'keep' })
        setActionError('Your partner removed this item.')
      }
    } catch {
      setFormError(message)
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
      setActionError("Couldn't update it. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  async function doDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    try {
      await deleteBucketItem(createClient(), confirmDelete.id)
      forgetPictures([confirmDelete.image_path])
      setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id))
      setConfirmDelete(null)
      load() // deletes aren't delivered by realtime
    } catch {
      setActionError("Couldn't remove it. Try again.")
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
              {progress.total > 0 ? `${progress.done} of ${progress.total} done` : 'Things you want to try together'}
            </p>
          </div>
          {status === 'ready' && (
            <button
              onClick={openCreate}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-rose px-4 py-2.5 text-xs font-bold text-white shadow-elevated active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add
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
            aria-label="Bucket list progress"
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
          <p className="text-sm text-ink-muted">Connect with your partner first to start a bucket list.</p>
          <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
        </div>
      ) : status === 'error' && items.length === 0 ? (
        <div className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2">
          <p className="text-sm text-red-600">Couldn&apos;t load your bucket list.</p>
          <button
            onClick={() => { setStatus('loading'); if (info) load(); else setAttempt((n) => n + 1) }}
            className="flex items-center gap-1 text-xs font-semibold text-red-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sage/15">
            <ListChecks className="h-8 w-8 text-sage-dark" />
          </div>
          <h2 className="text-lg font-bold text-ink">Your bucket list is empty</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Write down what you want to do together, from a new food spot to a dream vacation.
          </p>
          <button
            onClick={openCreate}
            className="mt-6 w-full max-w-xs rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
          >
            Add the first one
          </button>
          <Link href="/app/ide-date" className="mt-3 text-sm font-semibold text-rose">Or get date ideas from AI</Link>
        </div>
      ) : (
        <div className="px-6 pt-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-cream p-1" role="tablist" aria-label="Bucket list status">
            {(['belum', 'sudah'] as const).map((t) => ( // copy-ok: internal tab keys, never shown
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
                {t === 'belum' ? `To do (${pending.length})` : `Done (${done.length})`}
              </button>
            ))}
          </div>

          {actionError && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm text-ink-muted">
                {tab === 'belum'
                  ? 'Everything is done. Time to add something new.'
                  : 'Nothing done yet. Pick one and make it happen.'}
              </p>
              {tab === 'belum' && (
                <button onClick={openCreate} className="mt-3 text-sm font-semibold text-rose">Add something</button>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((item) => (
                <BucketRow
                  key={item.id}
                  item={item}
                  pictureUrl={urlFor(item.image_path)}
                  busy={busyId === item.id}
                  onToggle={() => toggleDone(item)}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setConfirmDelete(item)}
                  onViewPicture={() => setViewing(item)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add / edit */}
      <Modal open={formOpen} onClose={closeForm} title={editing ? 'Edit item' : 'Add to bucket list'}>
        <form onSubmit={submitForm} className="max-h-[65vh] space-y-4 overflow-y-auto pb-1">
          <div>
            <label htmlFor="bucket-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              What do you want to do?
            </label>
            <input
              id="bucket-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, BUCKET_TITLE_MAX) }))}
              maxLength={BUCKET_TITLE_MAX}
              placeholder="e.g. Watch the sunrise at Bromo"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10"
            />
            <p className="mt-1 text-right text-[11px] text-ink-muted">{form.title.length}/{BUCKET_TITLE_MAX}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Category</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
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
              Note (optional)
            </label>
            <textarea
              id="bucket-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value.slice(0, BUCKET_NOTE_MAX) }))}
              maxLength={BUCKET_NOTE_MAX}
              rows={3}
              placeholder="Details, the place, or why you want to"
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10"
            />
          </div>

          <div>
            <label htmlFor="bucket-cost" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Estimated cost (optional)
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

          <div>
            <label htmlFor="bucket-link" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Link (optional)
            </label>
            <div
              className={cn(
                'flex items-center rounded-2xl border bg-surface pl-4 focus-within:ring-2',
                linkError ? 'border-red-300 focus-within:ring-red-100' : 'border-border focus-within:border-rose focus-within:ring-rose/10'
              )}
            >
              <Link2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <input
                id="bucket-link"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                value={form.link}
                onChange={(e) => { setForm((f) => ({ ...f, link: e.target.value.slice(0, BUCKET_LINK_MAX * 2) })); setLinkError('') }}
                onBlur={() => { if (form.link.trim()) checkLink() }}
                disabled={saving}
                placeholder="e.g. a Maps or Instagram link"
                aria-invalid={!!linkError}
                aria-describedby={form.link.trim() || linkError ? 'bucket-link-hint' : undefined}
                className="min-w-0 flex-1 bg-transparent px-2 py-3.5 text-sm text-ink outline-none placeholder:text-ink-muted/60"
              />
              {form.link && !saving && (
                <button
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, link: '' })); setLinkError('') }}
                  aria-label="Clear link"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <LinkHint id="bucket-link-hint" link={form.link} error={linkError} />
          </div>

          <PictureField
            picture={picture}
            existingPath={editing?.image_path ?? null}
            existingUrl={urlFor(editing?.image_path ?? null)}
            preparing={preparing}
            error={pictureError}
            disabled={saving}
            onPick={pickPicture}
            onRemove={removePicture}
            onUndoRemove={() => setPicture({ kind: 'keep' })}
          />

          {formError && <p className="text-sm font-medium text-red-600" role="alert">{formError}</p>}

          {uploadPct !== null && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-cream"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadPct}
              aria-label="Picture upload"
            >
              <div className="h-full rounded-full bg-rose transition-all" style={{ width: `${uploadPct}%` }} />
            </div>
          )}

          <Button type="submit" loading={saving} disabled={!form.title.trim() || preparing}>
            {saving && uploadPct !== null && uploadPct < 100
              ? `Uploading picture ${uploadPct}%`
              : saving
                ? 'Saving'
                : editing ? 'Save changes' : 'Add'}
          </Button>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => !deleting && setConfirmDelete(null)} title="Remove from bucket list?">
        <p className="mb-5 text-sm text-ink-light">
          “{confirmDelete?.title}” will be removed for both of you.
          {confirmDelete?.image_path ? ' Its picture goes too.' : ''}
          {confirmDelete?.moment_id ? ' The saved Moment stays.' : ''}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={doDelete} loading={deleting}>Remove</Button>
        </div>
      </Modal>

      {/* Done → offer a Moment */}
      <Modal open={!!celebrate} onClose={() => setCelebrate(null)}>
        {celebrate && (
          <div className="text-center">
            <p className="text-4xl" aria-hidden>🎉</p>
            <h3 className="mt-2 text-lg font-bold text-ink">You did it!</h3>
            <p className="mt-1 text-sm text-ink-light">
              You ticked off “{celebrate.title}”. Want to save it as a Moment, with photos and the story?
            </p>
            <div className="mt-5 space-y-2">
              <Link
                href={momentPrefillHref(celebrate)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
              >
                <Camera className="h-4 w-4" /> Save as a Moment
              </Link>
              <Button variant="ghost" onClick={() => setCelebrate(null)}>Maybe later</Button>
            </div>
          </div>
        )}
      </Modal>

      {viewingNow?.image_path && (
        <PictureViewer
          path={viewingNow.image_path}
          url={urlFor(viewingNow.image_path)}
          title={viewingNow.title}
          link={viewingNow.reference_url}
          onClose={closeViewer}
        />
      )}
    </div>
  )
}

/** Under the link field: what's wrong, or how the link will show on the item. */
function LinkHint({ id, link, error }: { id: string; link: string; error: string }) {
  if (error) return <p id={id} className="mt-1.5 text-xs font-medium text-red-600" role="alert">{error}</p>
  const result = link.trim() ? normalizeReferenceUrl(link) : null
  if (result?.url) return <p id={id} className="mt-1.5 truncate text-[11px] text-ink-muted">Shows as {linkLabel(result.url)}</p>
  return null
}

function BucketRow({
  item, pictureUrl, busy, onToggle, onEdit, onDelete, onViewPicture,
}: {
  item: BucketItem
  /** undefined while signing, null when it can't be shown */
  pictureUrl: string | null | undefined
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onViewPicture: () => void
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
          aria-label={item.is_done ? `Mark as not done: ${item.title}` : `Mark as done: ${item.title}`}
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
                <Sparkles className="h-3 w-3" /> AI idea
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
                aria-label={`Remove ${item.title}`}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-danger hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className={cn('break-words font-bold', item.is_done ? 'text-ink-light' : 'text-ink')}>{item.title}</p>
              {item.note && <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-muted">{item.note}</p>}
              {cost !== null && cost > 0 && <p className="mt-1 text-xs text-ink-light">About {formatRupiah(cost)}</p>}
            </div>
            {item.image_path && (
              <button
                type="button"
                onClick={onViewPicture}
                aria-label={`View the picture for ${item.title}`}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-cream active:scale-[0.98]"
              >
                <SignedImg path={item.image_path} url={pictureUrl} alt="" lazy className={cn('h-full w-full', item.is_done && 'opacity-80')} />
              </button>
            )}
          </div>
          {item.reference_url && <LinkChip url={item.reference_url} className="mt-2" />}

          {item.is_done && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.done_at && (
                <span className="text-xs font-medium text-sage-dark">
                  Done on {formatDateID(todayJakarta(new Date(item.done_at)))}
                </span>
              )}
              {item.moment_id ? (
                <Link href={`/app/moments/${item.moment_id}`} className="flex items-center gap-1 text-xs font-semibold text-rose">
                  <Camera className="h-3.5 w-3.5" /> View Moment
                </Link>
              ) : (
                <Link href={momentPrefillHref(item)} className="flex items-center gap-1 text-xs font-semibold text-rose">
                  <Camera className="h-3.5 w-3.5" /> Save as a Moment
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
