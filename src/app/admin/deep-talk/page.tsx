'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Eye, EyeOff, GripVertical, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { DeepTalkPack } from '@/lib/deep-talk'

export default function AdminDeepTalkPage() {
  const [packs, setPacks] = useState<DeepTalkPack[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingPack, setSavingPack] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const loadPacks = useCallback(async () => {
    const supabase = createClient()
    const { data, error: loadError } = await supabase
      .from('deep_talk_packs')
      .select('*')
      .order('sort_order')
    if (loadError) setError(`Gagal memuat pack: ${loadError.message}`)
    else setPacks((data ?? []) as DeepTalkPack[])
    setLoading(false)
  }, [])

  useEffect(() => { loadPacks() }, [loadPacks])

  async function togglePublished(pack: DeepTalkPack) {
    setError('')
    setToggling(pack.id)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('deep_talk_packs')
      .update({ is_published: !pack.is_published })
      .eq('id', pack.id)
    if (updateError) setError(`Gagal mengubah status "${pack.title}": ${updateError.message}`)
    await loadPacks()
    setToggling(null)
  }

  async function createPack() {
    // A ref, not state: a double tap fires twice before the re-render.
    if (!newTitle.trim() || inFlight.current) return
    inFlight.current = true
    setError('')
    setSavingPack(true)
    const supabase = createClient()
    const slug = newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const maxOrder = packs.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0)
    const { error: insertError } = await supabase.from('deep_talk_packs').insert({
      slug: `${slug}-${Date.now()}`,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      sort_order: maxOrder + 1,
      is_published: false,
    })
    if (insertError) {
      setError(`Gagal membuat pack: ${insertError.message}`)
    } else {
      setNewTitle('')
      setNewDesc('')
      setCreating(false)
      await loadPacks()
    }
    inFlight.current = false
    setSavingPack(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Deep Talk</h1>
          <p className="mt-1 text-sm text-ink-muted">{packs.length} pack tersedia</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-rose px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-dark"
        >
          <Plus className="h-4 w-4" /> Buat Pack
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-semibold">Tutup</button>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <form
          onSubmit={e => { e.preventDefault(); createPack() }}
          className="mb-5 rounded-2xl border border-rose/30 bg-rose/5 p-4"
        >
          <p className="mb-3 text-sm font-semibold text-ink">Pack Baru</p>
          <div className="space-y-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Judul pack (wajib)"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-rose"
            />
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Deskripsi (opsional)"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-rose"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={savingPack || !newTitle.trim()}
              className="rounded-xl bg-rose px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingPack ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={savingPack}
              className="rounded-xl border border-border px-4 py-2 text-sm text-ink-muted"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Pack list */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {packs.map(pack => (
            <div key={pack.id} className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 sm:gap-4 sm:px-5">
              <GripVertical className="hidden h-4 w-4 flex-shrink-0 text-gray-300 sm:block" />
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ background: pack.color ?? '#E07A9E' }}
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{pack.title}</p>
                <p className="text-xs text-ink-muted truncate">{pack.description ?? '—'}</p>
              </div>
              <button
                onClick={() => togglePublished(pack)}
                disabled={toggling === pack.id}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  pack.is_published
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {pack.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {pack.is_published ? 'Published' : 'Draft'}
              </button>
              <Link
                href={`/admin/deep-talk/${pack.id}`}
                className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-rose hover:underline"
              >
                Edit <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
          {packs.length === 0 && (
            <div className="py-12 text-center text-sm text-ink-muted">Belum ada pack. Buat pack pertama!</div>
          )}
        </div>
      )}
    </div>
  )
}
