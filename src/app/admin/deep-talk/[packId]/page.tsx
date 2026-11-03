'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Check, X, ChevronDown, ChevronUp, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { DeepTalkPack, DeepTalkLevel, DeepTalkQuestion } from '@/lib/deep-talk'
import DeepTalkPackIcon, { DEEP_TALK_ICON_NAMES } from '@/components/game/DeepTalkPackIcon'

interface LevelWithQuestions extends DeepTalkLevel {
  questions: DeepTalkQuestion[]
  open: boolean
}

// Pack accent colors used across the Deep Talk screens.
const PACK_COLORS = ['#E07A9E', '#F06B6B', '#E8C078', '#7EC4A0', '#7FA7D9', '#9B8AD1', '#F4A261', '#2A9D8F', '#B5838D', '#F2B134']

export default function AdminPackEditorPage() {
  const { packId } = useParams<{ packId: string }>()
  const router = useRouter()
  const [packColor, setPackColor] = useState<string | null>(null)
  const [packIcon, setPackIcon] = useState<string | null>(null)
  const [packFree, setPackFree] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingPack, setDeletingPack] = useState(false)
  const [addingNewLevel, setAddingNewLevel] = useState(false)

  const [pack, setPack] = useState<DeepTalkPack | null>(null)
  const [levels, setLevels] = useState<LevelWithQuestions[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPack, setEditingPack] = useState(false)
  const [packTitle, setPackTitle] = useState('')
  const [packDesc, setPackDesc] = useState('')
  const [newQuestions, setNewQuestions] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [addingLevel, setAddingLevel] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Refs, not state: Enter + click (or a double tap) fire before the re-render.
  const addInFlight = useRef<Set<string>>(new Set())
  const saveInFlight = useRef(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: p, error: packError } = await supabase.from('deep_talk_packs').select('*').eq('id', packId).maybeSingle()
    if (packError) setError(`Gagal memuat pack: ${packError.message}`)
    if (!p) { setLoading(false); return }
    setPack(p as DeepTalkPack)
    setPackTitle(p.title)
    setPackDesc(p.description ?? '')
    setPackColor(p.color)
    setPackIcon(p.icon_name)
    setPackFree(p.is_free)

    const { data: lvls, error: levelError } = await supabase.from('deep_talk_levels').select('*').eq('pack_id', packId).order('level_number')
    if (levelError) setError(`Gagal memuat level: ${levelError.message}`)
    const levelList = (lvls ?? []) as DeepTalkLevel[]

    const withQuestions = await Promise.all(
      levelList.map(async (l) => {
        const { data: qs, error: questionError } = await supabase
          .from('deep_talk_questions')
          .select('*')
          .eq('level_id', l.id)
          .order('sort_order')
        if (questionError) setError(`Gagal memuat pertanyaan: ${questionError.message}`)
        return { ...l, questions: (qs ?? []) as DeepTalkQuestion[] }
      })
    )
    // Keep collapsed levels collapsed across reloads.
    setLevels(prev => withQuestions.map(l => ({ ...l, open: prev.find(x => x.id === l.id)?.open ?? true })))
    setLoading(false)
  }, [packId])

  useEffect(() => { loadData() }, [loadData])

  async function savePack() {
    if (saveInFlight.current) return
    if (!packTitle.trim()) { setError('Judul pack tidak boleh kosong'); return }
    saveInFlight.current = true
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('deep_talk_packs')
      .update({ title: packTitle.trim(), description: packDesc.trim() || null, color: packColor, icon_name: packIcon, is_free: packFree })
      .eq('id', packId)
    if (updateError) {
      setError(`Gagal menyimpan pack: ${updateError.message}`)
    } else {
      setEditingPack(false)
      await loadData()
    }
    saveInFlight.current = false
    setSaving(false)
  }

  async function addQuestion(levelId: string) {
    const text = newQuestions[levelId]?.trim()
    if (!text || addInFlight.current.has(levelId)) return
    addInFlight.current.add(levelId)
    setAddingLevel(levelId)
    setError('')
    const supabase = createClient()
    const level = levels.find(l => l.id === levelId)
    const maxOrder = (level?.questions ?? []).reduce((m, q) => Math.max(m, q.sort_order ?? 0), 0)
    const { error: insertError } = await supabase.from('deep_talk_questions').insert({
      level_id: levelId,
      question_text: text,
      sort_order: maxOrder + 1,
    })
    if (insertError) {
      setError(`Gagal menambah pertanyaan: ${insertError.message}`)
    } else {
      setNewQuestions(prev => ({ ...prev, [levelId]: '' }))
      await loadData()
    }
    addInFlight.current.delete(levelId)
    setAddingLevel(null)
  }

  async function deleteQuestion(questionId: string): Promise<boolean> {
    setError('')
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('deep_talk_questions').delete().eq('id', questionId)
    if (deleteError) {
      setError(`Gagal menghapus pertanyaan: ${deleteError.message}`)
      return false
    }
    await loadData()
    return true
  }

  async function updateQuestion(questionId: string, text: string): Promise<boolean> {
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.from('deep_talk_questions').update({ question_text: text }).eq('id', questionId)
    if (updateError) {
      setError(`Gagal menyimpan pertanyaan: ${updateError.message}`)
      return false
    }
    setLevels(prev => prev.map(l => ({
      ...l,
      questions: l.questions.map(q => q.id === questionId ? { ...q, question_text: text } : q),
    })))
    return true
  }

  function toggleLevel(id: string) {
    setLevels(prev => prev.map(l => l.id === id ? { ...l, open: !l.open } : l))
  }

  async function updateLevel(levelId: string, title: string, description: string): Promise<boolean> {
    setError('')
    const { error: updateError } = await createClient()
      .from('deep_talk_levels')
      .update({ title: title.trim(), description: description.trim() || null })
      .eq('id', levelId)
    if (updateError) {
      setError(`Gagal menyimpan level: ${updateError.message}`)
      return false
    }
    setLevels(prev => prev.map(l => l.id === levelId ? { ...l, title: title.trim(), description: description.trim() || null } : l))
    return true
  }

  async function addLevel() {
    if (addingNewLevel) return
    setAddingNewLevel(true)
    setError('')
    const next = levels.reduce((m, l) => Math.max(m, l.level_number), 0) + 1
    const { error: insertError } = await createClient()
      .from('deep_talk_levels')
      .insert({ pack_id: packId, level_number: next, title: `Level ${next}` })
    if (insertError) setError(`Gagal menambah level: ${insertError.message}`)
    else await loadData()
    setAddingNewLevel(false)
  }

  async function deletePack() {
    if (deletingPack) return
    setDeletingPack(true)
    setError('')
    // Levels, questions and couples' progress for this pack cascade.
    const { error: deleteError } = await createClient().from('deep_talk_packs').delete().eq('id', packId)
    if (deleteError) {
      setError(`Gagal menghapus pack: ${deleteError.message}`)
      setDeletingPack(false)
      setConfirmDelete(false)
      return
    }
    router.replace('/admin/deep-talk')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-5 w-5 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  return (
    <div>
      <Link href="/admin/deep-talk" className="mb-5 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Deep Talk
      </Link>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-semibold">Tutup</button>
        </div>
      )}

      {!pack ? (
        <p className="py-12 text-center text-sm text-ink-muted">Pack tidak ditemukan.</p>
      ) : (
        <>
          {/* Pack header */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {editingPack ? (
              <div className="space-y-2">
                <input
                  value={packTitle}
                  onChange={e => setPackTitle(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm font-bold outline-none focus:border-rose"
                />
                <input
                  value={packDesc}
                  onChange={e => setPackDesc(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-rose"
                  placeholder="Deskripsi"
                />
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <span className="text-xs text-ink-muted">Warna</span>
                  {PACK_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPackColor(c)}
                      aria-label={`Warna ${c}`}
                      className={`h-7 w-7 rounded-full border-2 ${packColor === c ? 'border-ink' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <span className="text-xs text-ink-muted">Ikon</span>
                  {DEEP_TALK_ICON_NAMES.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPackIcon(name)}
                      aria-label={`Ikon ${name}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 ${packIcon === name ? 'border-ink bg-cream' : 'border-transparent'}`}
                    >
                      <DeepTalkPackIcon name={name} className="h-4 w-4 text-ink" />
                    </button>
                  ))}
                </div>
                <label className="flex items-start gap-2 py-1 text-xs text-ink">
                  <input type="checkbox" checked={packFree} onChange={e => setPackFree(e.target.checked)} className="mt-0.5 accent-rose" />
                  <span>
                    <span className="font-semibold">Gratis, semua level terbuka</span>
                    <span className="block text-ink-muted">Semua pasangan bisa main level mana saja tanpa Premium dan tanpa urutan.</span>
                  </span>
                </label>
                <div className="flex gap-2">
                  <button onClick={savePack} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-rose px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    onClick={() => { setEditingPack(false); setPackTitle(pack.title); setPackDesc(pack.description ?? ''); setPackColor(pack.color); setPackIcon(pack.icon_name); setPackFree(pack.is_free) }}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-ink-muted"
                  >
                    <X className="h-3.5 w-3.5" /> Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-ink">{pack.title}</h1>
                  <p className="mt-1 text-sm text-ink-muted">{pack.description ?? '—'}</p>
                  {pack.is_free && (
                    <span className="mt-2 inline-block rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-bold text-sage-dark">Gratis · semua level terbuka</span>
                  )}
                </div>
                <button onClick={() => setEditingPack(true)} className="flex-shrink-0 text-xs font-medium text-rose hover:underline">Edit</button>
              </div>
            )}
          </div>

          {/* Levels */}
          <div className="space-y-4">
            {levels.map((level) => (
              <div key={level.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* Level header */}
                <button
                  onClick={() => toggleLevel(level.id)}
                  className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose/10 text-xs font-bold text-rose">
                      {level.level_number}
                    </span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-ink">{level.title}</p>
                      <p className="text-xs text-ink-muted">{level.questions.length} pertanyaan</p>
                    </div>
                  </div>
                  {level.open ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
                </button>

                {level.open && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 sm:px-5">
                    <LevelMeta level={level} onSave={(title, desc) => updateLevel(level.id, title, desc)} />

                    {/* Questions list */}
                    <div className="space-y-2 mb-3">
                      {level.questions.map((q, qi) => (
                        <QuestionRow
                          key={q.id}
                          question={q}
                          index={qi + 1}
                          onDelete={() => deleteQuestion(q.id)}
                          onUpdate={(text) => updateQuestion(q.id, text)}
                        />
                      ))}
                      {level.questions.length === 0 && (
                        <p className="py-2 text-xs text-ink-muted">Belum ada pertanyaan di level ini.</p>
                      )}
                    </div>

                    {/* Add question */}
                    <form
                      onSubmit={e => { e.preventDefault(); addQuestion(level.id) }}
                      className="flex gap-2"
                    >
                      <input
                        value={newQuestions[level.id] ?? ''}
                        onChange={e => setNewQuestions(prev => ({ ...prev, [level.id]: e.target.value }))}
                        placeholder="Ketik pertanyaan baru, Enter untuk simpan..."
                        className="min-w-0 flex-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-xs outline-none focus:border-rose focus:bg-white"
                      />
                      <button
                        type="submit"
                        disabled={addingLevel === level.id || !(newQuestions[level.id] ?? '').trim()}
                        aria-label="Tambah pertanyaan"
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-rose text-white disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addLevel}
            disabled={addingNewLevel}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-rose/30 py-3 text-sm font-semibold text-rose disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {addingNewLevel ? 'Menambah...' : 'Tambah Level'}
          </button>

          {/* Danger zone */}
          <div className="mt-8 rounded-2xl border border-red-100 bg-white p-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-sm text-ink">
                  Hapus &ldquo;{pack.title}&rdquo; beserta semua level, pertanyaan, dan progres pasangan?
                </p>
                <button
                  onClick={deletePack}
                  disabled={deletingPack}
                  className="rounded-xl bg-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {deletingPack ? 'Menghapus...' : 'Ya, hapus'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deletingPack}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-ink-muted"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                <Trash2 className="h-4 w-4" /> Hapus pack ini
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function LevelMeta({
  level,
  onSave,
}: {
  level: DeepTalkLevel
  onSave: (title: string, description: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState(level.title)
  const [description, setDescription] = useState(level.description ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = title.trim() !== level.title || (description.trim() || null) !== (level.description ?? null)

  async function save() {
    if (busy || !title.trim()) return
    setBusy(true)
    await onSave(title, description)
    setBusy(false)
  }

  return (
    <div className="mb-3 space-y-2 rounded-xl bg-gray-50 p-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Judul level"
        className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-rose"
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Deskripsi singkat level (opsional)"
        className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs outline-none focus:border-rose"
      />
      {dirty && (
        <button
          onClick={save}
          disabled={busy || !title.trim()}
          className="flex items-center gap-1 rounded-lg bg-rose px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> {busy ? 'Menyimpan...' : 'Simpan level'}
        </button>
      )}
    </div>
  )
}

function QuestionRow({
  question,
  index,
  onDelete,
  onUpdate,
}: {
  question: DeepTalkQuestion
  index: number
  onDelete: () => Promise<boolean>
  onUpdate: (text: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState(question.question_text)
  const inFlight = useRef(false)

  async function save() {
    const trimmed = text.trim()
    if (!trimmed || inFlight.current) return
    if (trimmed === question.question_text) { setEditing(false); return }
    inFlight.current = true
    setBusy(true)
    const ok = await onUpdate(trimmed)
    inFlight.current = false
    setBusy(false)
    if (ok) setEditing(false)
  }

  async function remove() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const ok = await onDelete()
    // On success the row disappears with the reload.
    if (!ok) {
      inFlight.current = false
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="group flex items-start gap-2 rounded-xl border border-transparent p-2 hover:border-gray-100 hover:bg-gray-50 transition-colors">
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-bold text-ink-muted">
        {index}
      </span>
      {editing ? (
        <form onSubmit={e => { e.preventDefault(); save() }} className="flex min-w-0 flex-1 gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-rose px-2 py-1 text-xs outline-none"
          />
          <button type="submit" disabled={busy} aria-label="Simpan" className="text-rose disabled:opacity-50"><Check className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={() => { setEditing(false); setText(question.question_text) }}
            aria-label="Batal"
            className="text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : confirming ? (
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-ink">Hapus pertanyaan ini?</span>
          <button onClick={remove} disabled={busy} className="font-semibold text-red-500 hover:text-red-700 disabled:opacity-50">
            {busy ? 'Menghapus...' : 'Ya, hapus'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={busy} className="text-ink-muted hover:text-ink">Batal</button>
        </div>
      ) : (
        <>
          <p
            className="flex-1 cursor-pointer text-xs text-ink hover:text-rose transition-colors"
            onClick={() => { setText(question.question_text); setEditing(true) }}
          >
            {question.question_text}
          </p>
          {/* Always visible on touch screens; hover-reveal only with a mouse (lg+). */}
          <button
            onClick={() => setConfirming(true)}
            aria-label="Hapus pertanyaan"
            className="ml-1 text-red-400 transition-opacity hover:text-red-600 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
