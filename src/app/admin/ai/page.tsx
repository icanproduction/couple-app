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
  return new Date(iso).toLocaleString('en-GB', {
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
  if (!res.ok) throw new Error(json.error ?? 'Couldn\'t reach the server')
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
      setLoadError(e instanceof Error ? e.message : 'Couldn\'t load the settings')
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
        ? { ok: true, text: 'Key saved and working. AI features are on.' }
        : { ok: false, text: `Key saved, but the test failed: ${t.check?.message ?? 'unknown error'}` })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Couldn\'t save the key' })
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
      setNotice({ ok: true, text: s.model ? `Model changed to ${s.model}.` : `Model reset to the default (${s.default_model}).` })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Couldn\'t save the model' })
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
      setNotice({ ok: !!t.check?.ok, text: t.check?.message ?? 'Test finished' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Test failed' })
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
      setNotice({ ok: true, text: s.env_key_set ? 'Key removed. Now using LLM_API_KEY from the server.' : 'Key removed. AI features are off until you paste a new key.' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Couldn\'t remove the key' })
    } finally {
      setBusy(null)
    }
  }

  const active = status?.in_use.source !== 'none'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">AI settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The daily AI questions and Date Ideas use GPT Luna through OpenRouter. Paste an API key here to turn them on.
        </p>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="flex-1">{loadError}</span>
          <button onClick={load} className="text-xs font-semibold">Try again</button>
        </div>
      )}

      {/* Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {!status ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-sage/15 text-sage-dark' : 'bg-gray-100 text-ink-muted'}`}>
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-ink">{active ? 'AI is on' : 'AI is off'}</p>
                <p className="text-sm text-ink-muted">
                  {status.in_use.source === 'admin' && <>Using the key pasted here (••••{status.key_last4}) · model <span className="font-mono">{status.in_use.model}</span></>}
                  {status.in_use.source === 'env' && <>Using LLM_API_KEY from the server · model <span className="font-mono">{status.in_use.model}</span></>}
                  {status.in_use.source === 'none' && <>No API key yet. Users see a message that AI features aren&apos;t turned on.</>}
                </p>
                {status.key_set_at && (
                  <p className="mt-0.5 text-xs text-ink-muted/70">Key saved {formatWhen(status.key_set_at)}</p>
                )}
                {status.tested_at && (
                  <p className={`mt-1 flex items-center gap-1 text-xs ${status.test_ok ? 'text-sage-dark' : 'text-red-600'}`}>
                    {status.test_ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    Tested {formatWhen(status.tested_at)}: {status.test_message}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={test}
              disabled={!!busy || !active}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-ink hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Test connection
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
          <KeyRound className="h-5 w-5 text-rose" /> {status?.key_set ? 'Replace API key' : 'Paste your OpenRouter API key'}
        </h2>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-ink-muted">
          <li>
            Go to{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-rose">
              openrouter.ai/keys <ExternalLink className="h-3 w-3" />
            </a>{' '}
            and create a new key.
          </li>
          <li>Set a credit limit on that key so costs can&apos;t run away.</li>
          <li>Copy the key (it starts with <span className="font-mono">sk-or-</span>) and paste it below.</li>
        </ol>

        <label htmlFor="llm-key" className="mt-4 block text-xs font-semibold text-ink">API key</label>
        <div className="mt-1 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id="llm-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.key_set ? `Saved: ••••${status.key_last4}. Paste a new key to replace it` : 'sk-or-v1-…'}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-10 font-mono text-sm focus:border-rose focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
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
            {busy === 'key' || (busy === 'test' && !!apiKey) ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          Your key is stored encrypted in Supabase Vault. Once saved, it is never shown again, only its last 4 characters.
          {status?.env_key_set && ' The server also has an LLM_API_KEY; the key pasted here takes priority.'}
        </p>

        {status?.key_set && (
          confirmClear ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">Remove the saved key?</p>
              <p className="mt-0.5 text-xs text-red-600/80">
                {status.env_key_set ? 'AI will use LLM_API_KEY from the server.' : 'AI features stop until you paste a new key.'}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setConfirmClear(false)} className="flex-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-semibold text-ink-muted">Cancel</button>
                <button type="button" onClick={clearKey} disabled={busy === 'clear'} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                  {busy === 'clear' ? 'Removing…' : 'Yes, remove'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Remove saved key
            </button>
          )
        )}
      </form>

      {/* Model */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink">Model</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Default <span className="font-mono">{status?.default_model ?? 'openai/gpt-6-luna'}</span>. Change it only if you need to. Use a model ID from the OpenRouter list (avoid <span className="font-mono">~…-latest</span> aliases, which can change without notice).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="llm-model" className="sr-only">Model ID</label>
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
            {busy === 'model' ? 'Saving…' : 'Save model'}
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
