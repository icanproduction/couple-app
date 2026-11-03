'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Plug, RotateCcw, Sparkles, Trash2, XCircle,
} from 'lucide-react'

interface LlmStatus {
  key_set: boolean
  key_last4: string | null
  key_set_at: string | null
  model: string | null
  tested_at: string | null
  test_ok: boolean | null
  test_message: string | null
  in_use: { source: 'admin' | 'env' | 'none'; model: string }
  env_key_set: boolean
  default_model: string
}

type Notice = { ok: boolean; text: string } | null

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

async function call(method: 'GET' | 'PUT' | 'DELETE' | 'POST', body?: unknown) {
  const res = await fetch('/api/admin/llm', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Gagal menghubungi server')
  return json as LlmStatus & { check?: { ok: boolean; message: string } }
}

export default function AdminAiPage() {
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState<'key' | 'model' | 'test' | 'clear' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await call('GET')
      setStatus(s)
      setModel(s.model ?? '')
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat pengaturan')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim() || busy) return
    setBusy('key'); setNotice(null)
    try {
      const s = await call('PUT', { apiKey: apiKey.trim() })
      setStatus(s)
      setApiKey(''); setShowKey(false)
      // Check right away so a wrong paste shows up immediately.
      setBusy('test')
      const t = await call('POST', { action: 'test' })
      setStatus(t)
      setNotice(t.check?.ok
        ? { ok: true, text: 'Key tersimpan dan berfungsi. Fitur AI sudah aktif.' }
        : { ok: false, text: `Key tersimpan, tapi tes gagal: ${t.check?.message ?? 'tidak diketahui'}` })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan key' })
    } finally {
      setBusy(null)
    }
  }

  async function saveModel(next: string) {
    if (busy) return
    setBusy('model'); setNotice(null)
    try {
      const s = await call('PUT', { model: next.trim() || null })
      setStatus(s)
      setModel(s.model ?? '')
      setNotice({ ok: true, text: s.model ? `Model diganti ke ${s.model}.` : `Model kembali ke default (${s.default_model}).` })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan model' })
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    if (busy) return
    setBusy('test'); setNotice(null)
    try {
      const t = await call('POST', { action: 'test' })
      setStatus(t)
      setNotice({ ok: !!t.check?.ok, text: t.check?.message ?? 'Tes selesai' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Tes gagal' })
    } finally {
      setBusy(null)
    }
  }

  async function clearKey() {
    if (busy) return
    setBusy('clear'); setNotice(null)
    try {
      const s = await call('DELETE')
      setStatus(s)
      setConfirmClear(false)
      setNotice({ ok: true, text: s.env_key_set ? 'Key dihapus. Sekarang memakai LLM_API_KEY dari server.' : 'Key dihapus. Fitur AI nonaktif sampai key baru ditempel.' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Gagal menghapus key' })
    } finally {
      setBusy(null)
    }
  }

  const active = status?.in_use.source !== 'none'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pengaturan AI</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pertanyaan AI harian dan Ide Date memakai GPT Luna lewat OpenRouter. Tempel API key di sini untuk mengaktifkannya.
        </p>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="flex-1">{loadError}</span>
          <button onClick={load} className="text-xs font-semibold">Coba lagi</button>
        </div>
      )}

      {/* Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {!status ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-sage/15 text-sage-dark' : 'bg-gray-100 text-ink-muted'}`}>
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-ink">{active ? 'AI aktif' : 'AI belum aktif'}</p>
                <p className="text-sm text-ink-muted">
                  {status.in_use.source === 'admin' && <>Memakai key yang ditempel di sini (••••{status.key_last4}) · model <span className="font-mono">{status.in_use.model}</span></>}
                  {status.in_use.source === 'env' && <>Memakai LLM_API_KEY dari server · model <span className="font-mono">{status.in_use.model}</span></>}
                  {status.in_use.source === 'none' && <>Belum ada API key. Pengguna melihat &ldquo;Fitur AI belum diaktifkan&rdquo;.</>}
                </p>
                {status.key_set_at && (
                  <p className="mt-0.5 text-xs text-ink-muted/70">Key disimpan {formatWhen(status.key_set_at)}</p>
                )}
                {status.tested_at && (
                  <p className={`mt-1 flex items-center gap-1 text-xs ${status.test_ok ? 'text-sage-dark' : 'text-red-600'}`}>
                    {status.test_ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    Tes {formatWhen(status.tested_at)}: {status.test_message}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={test}
              disabled={!!busy || !active}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-ink hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Tes koneksi
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${notice.ok ? 'bg-sage/10 text-sage-dark' : 'bg-red-50 text-red-700'}`} role="status">
          {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
        </div>
      )}

      {/* Paste key */}
      <form onSubmit={saveKey} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <KeyRound className="h-5 w-5 text-rose" /> {status?.key_set ? 'Ganti API key' : 'Tempel API key OpenRouter'}
        </h2>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-ink-muted">
          <li>
            Buka{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-rose">
              openrouter.ai/keys <ExternalLink className="h-3 w-3" />
            </a>{' '}
            lalu buat key baru.
          </li>
          <li>Pasang batas kredit di key itu supaya biaya tidak kebablasan.</li>
          <li>Salin key (diawali <span className="font-mono">sk-or-</span>) dan tempel di bawah.</li>
        </ol>

        <label htmlFor="llm-key" className="mt-4 block text-xs font-semibold text-ink">API key</label>
        <div className="mt-1 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id="llm-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.key_set ? `Tersimpan: ••••${status.key_last4}. Tempel key baru untuk mengganti` : 'sk-or-v1-…'}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-10 font-mono text-sm focus:border-rose focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Sembunyikan key' : 'Tampilkan key'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-muted hover:text-ink"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="submit"
            disabled={!apiKey.trim() || !!busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === 'key' || (busy === 'test' && !!apiKey) ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Simpan
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          Key disimpan terenkripsi di Supabase Vault. Setelah disimpan, key tidak pernah ditampilkan lagi, cuma 4 karakter terakhirnya.
          {status?.env_key_set && ' Server juga punya LLM_API_KEY; key yang ditempel di sini yang dipakai.'}
        </p>

        {status?.key_set && (
          confirmClear ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">Hapus key yang tersimpan?</p>
              <p className="mt-0.5 text-xs text-red-600/80">
                {status.env_key_set ? 'AI akan memakai LLM_API_KEY dari server.' : 'Fitur AI berhenti sampai key baru ditempel.'}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setConfirmClear(false)} className="flex-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-semibold text-ink-muted">Batal</button>
                <button type="button" onClick={clearKey} disabled={busy === 'clear'} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                  {busy === 'clear' ? 'Menghapus…' : 'Ya, hapus'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Hapus key tersimpan
            </button>
          )
        )}
      </form>

      {/* Model */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink">Model</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Default <span className="font-mono">{status?.default_model ?? 'openai/gpt-6-luna'}</span>. Ganti hanya kalau perlu; pakai ID model dari daftar OpenRouter (hindari alias <span className="font-mono">~…-latest</span>, isinya bisa berubah diam-diam).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="llm-model" className="sr-only">ID model</label>
          <input
            id="llm-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={status?.default_model ?? 'openai/gpt-6-luna'}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm focus:border-rose focus:outline-none"
          />
          <button
            onClick={() => saveModel(model)}
            disabled={!!busy || (model.trim() || null) === (status?.model ?? null)}
            className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === 'model' ? 'Menyimpan…' : 'Simpan model'}
          </button>
          {status?.model && (
            <button
              onClick={() => saveModel('')}
              disabled={!!busy}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-ink-muted hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Default
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
