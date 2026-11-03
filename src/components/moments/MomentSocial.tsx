'use client'

// Reactions + comments under a moment (F14). Both partners see each other's
// reaction and the thread; updates arrive live. Deletes aren't broadcast by
// realtime, so the thread also reloads when the app comes back into view.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, SendHorizontal, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import {
  MAX_COMMENT, MOMENT_REACTIONS,
  addMomentComment, deleteMomentComment, listMomentComments, listMomentReactions, setMomentReaction,
  type CoupleInfo, type MomentComment, type MomentReaction, type MomentReactionEmoji,
} from '@/lib/moments'

interface Props {
  momentId: string
  momentTitle: string
  info: CoupleInfo & { coupleId: string }
}

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

export default function MomentSocial({ momentId, momentTitle, info }: Props) {
  const [reactions, setReactions] = useState<MomentReaction[]>([])
  const [comments, setComments] = useState<MomentComment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [reacting, setReacting] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<MomentComment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const listEnd = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([listMomentReactions(momentId), listMomentComments(momentId)])
      if (!alive.current) return
      setReactions(r)
      setComments(c)
      setLoadError('')
    } catch {
      if (alive.current) setLoadError('Gagal memuat reaksi dan komentar.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [momentId])

  useEffect(() => {
    alive.current = true
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  useCoupleRealtime(info.coupleId, ['moment_comments', 'moment_reactions'], load)

  const nameOf = (profileId: string | null) => {
    if (!profileId) return 'Akun terhapus'
    if (profileId === info.userId) return 'Kamu'
    return info.names[profileId] ?? 'Pasanganmu'
  }

  const mine = reactions.find((r) => r.profile_id === info.userId)?.emoji ?? null
  const partnerReaction = reactions.find((r) => r.profile_id !== info.userId) ?? null

  async function react(emoji: MomentReactionEmoji) {
    if (reacting) return
    const next = mine === emoji ? null : emoji
    const before = reactions
    setActionError('')
    setReacting(true)
    setReactions((prev) => {
      const own = prev.find((r) => r.profile_id === info.userId)
      const others = prev.filter((r) => r.profile_id !== info.userId)
      // Optimistic row; the reload after saving brings the real one.
      return next
        ? [...others, {
            id: own?.id ?? `pending-${info.userId}`,
            moment_id: momentId, couple_id: info.coupleId, profile_id: info.userId, emoji: next,
            created_at: own?.created_at ?? new Date().toISOString(),
          }]
        : others
    })
    try {
      await setMomentReaction(momentId, info.coupleId, info.userId, next)
    } catch {
      if (alive.current) {
        setReactions(before)
        setActionError('Gagal menyimpan reaksi. Coba lagi.')
      }
    } finally {
      if (alive.current) setReacting(false)
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || body.length > MAX_COMMENT || sending) return
    setActionError('')
    setSending(true)
    try {
      const saved = await addMomentComment(momentId, info.coupleId, info.userId, body)
      if (!alive.current) return
      setComments((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]))
      setDraft('')
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      if (info.partnerId) {
        const snippet = body.length > 80 ? `${body.slice(0, 79)}…` : body
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: info.partnerId,
            title: `Komentar di "${momentTitle}"`.slice(0, 80),
            body: `${info.names[info.userId] ?? 'Pasanganmu'}: ${snippet}`,
            url: `/app/moments/${momentId}`,
            kind: 'moments',
          }),
        }).catch(() => undefined)
      }
    } catch (err) {
      if (alive.current) setActionError(err instanceof Error && err.message ? err.message : 'Gagal mengirim komentar. Coba lagi.')
    } finally {
      if (alive.current) setSending(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    try {
      await deleteMomentComment(confirmDelete.id)
      if (!alive.current) return
      setComments((prev) => prev.filter((c) => c.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch {
      if (alive.current) {
        setActionError('Gagal menghapus komentar. Coba lagi.')
        setConfirmDelete(null)
      }
    } finally {
      if (alive.current) setDeleting(false)
    }
  }

  const tooLong = draft.trim().length > MAX_COMMENT
  const reactionSummary = [
    mine ? `Kamu ${mine}` : null,
    partnerReaction ? `${nameOf(partnerReaction.profile_id)} ${partnerReaction.emoji}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section aria-label="Reaksi dan komentar" className="space-y-5">
      {/* Reactions */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Reaksi</p>
        {loading ? (
          <div className="flex justify-between gap-2">
            {MOMENT_REACTIONS.map((e) => <div key={e} className="h-11 flex-1 animate-pulse rounded-xl bg-rose-50" />)}
          </div>
        ) : (
          <>
            <div className="flex justify-between gap-2">
              {MOMENT_REACTIONS.map((emoji) => {
                const isMine = mine === emoji
                const isPartner = partnerReaction?.emoji === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(emoji)}
                    disabled={reacting}
                    aria-pressed={isMine}
                    aria-label={isMine ? `Hapus reaksi ${emoji}` : `Beri reaksi ${emoji}`}
                    className={cn(
                      'relative flex h-11 flex-1 items-center justify-center rounded-xl border text-xl transition-all active:scale-90 disabled:opacity-70',
                      isMine ? 'border-rose bg-rose-50 shadow-card' : 'border-transparent bg-cream'
                    )}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    {isPartner && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-sage px-1 text-[9px] font-bold uppercase text-white"
                      >
                        {nameOf(partnerReaction.profile_id).slice(0, 1)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-center text-xs text-ink-muted" aria-live="polite">
              {reactionSummary || 'Belum ada reaksi. Ketuk salah satu, ketuk lagi untuk batal.'}
            </p>
          </>
        )}
      </div>

      {/* Comments */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          <MessageCircle className="h-3.5 w-3.5" /> Komentar{comments.length > 0 ? ` · ${comments.length}` : ''}
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-rose-50" />)}
          </div>
        ) : loadError ? (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {loadError}{' '}
            <button type="button" onClick={() => { setLoading(true); load() }} className="font-semibold underline">
              Coba lagi
            </button>
          </div>
        ) : comments.length === 0 ? (
          <p className="py-2 text-center text-xs text-ink-muted">Belum ada komentar. Ceritain bagian favoritmu dari date ini.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => {
              const own = c.profile_id === info.userId
              const name = nameOf(c.profile_id)
              return (
                <li key={c.id} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase text-white',
                      own ? 'bg-rose' : c.profile_id ? 'bg-sage' : 'bg-ink-muted'
                    )}
                  >
                    {name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-cream px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-bold text-ink">{name}</p>
                      <time dateTime={c.created_at} className="shrink-0 text-[10px] text-ink-muted">
                        {timeFormat.format(new Date(c.created_at))}
                      </time>
                    </div>
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink-light">{c.body}</p>
                  </div>
                  {own && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(c)}
                      aria-label="Hapus komentar"
                      className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-xl text-ink-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <div ref={listEnd} />

        <form onSubmit={send} className="mt-4">
          <div className="flex items-end gap-2">
            <label htmlFor="moment-comment" className="sr-only">Tulis komentar</label>
            <textarea
              id="moment-comment"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
              }}
              maxLength={MAX_COMMENT + 50}
              rows={2}
              placeholder="Tulis komentar..."
              disabled={loading || !!loadError}
              className="min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-white px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-rose focus:ring-2 focus:ring-rose/10 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim() || tooLong}
              aria-label="Kirim komentar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose text-white shadow-elevated transition-all active:scale-95 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
          {(draft.length > MAX_COMMENT * 0.8 || tooLong) && (
            <p className={cn('mt-1 text-right text-[11px]', tooLong ? 'font-semibold text-danger' : 'text-ink-muted')}>
              {draft.trim().length}/{MAX_COMMENT}
            </p>
          )}
        </form>

        {actionError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
      </div>

      <Modal open={!!confirmDelete} onClose={() => !deleting && setConfirmDelete(null)} title="Hapus komentar ini?">
        <p className="line-clamp-3 rounded-xl bg-cream px-3 py-2 text-sm text-ink-light">{confirmDelete?.body}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            disabled={deleting}
            className="flex-1 rounded-2xl border border-border bg-white py-3 text-sm font-semibold text-ink-light"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-2xl bg-danger py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {deleting ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </Modal>
    </section>
  )
}
