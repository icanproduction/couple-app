'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, Plug, Sparkles, XCircle } from 'lucide-react'

type Feature = 'daily_question' | 'date_ideas' | 'pet_note' | 'pet_weekly' | 'samakan_set' | 'samakan_readout'

interface ClaudeStatus {
  configured: boolean
  key_source: 'env'
  key_last4: string | null
  model: string
  model_label: string
  day: string
  spend_today_usd: number | null
  spend_by_feature: Record<Feature, number> | null
  calls_today: number | null
  caps_usd: Record<Feature, number>
}

type Notice = { ok: boolean; text: string } | null

const FEATURE_LABELS: Record<Feature, string> = {
  daily_question: 'Daily Question',
  date_ideas: 'Date Ideas',
  pet_note: 'Pet Kita notes',
  pet_weekly: 'Pet Kita weekly note',
  samakan_set: 'Samakan question sets',
  samakan_readout: 'Samakan results',
}

/** "$0.0123": AI calls cost fractions of a cent, so four decimals. */
function usd(amount: number): string {
  return `$${amount.toFixed(4)}`
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

async function call(method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch('/api/admin/llm', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Couldn\'t reach the server')
  return json as ClaudeStatus & { check?: { ok: boolean; message: string } }
}

export default function AdminAiPage() {
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    try {
      setStatus(await call('GET'))
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Couldn\'t load the AI status')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function test() {
    if (testing) return
    setTesting(true); setNotice(null)
    try {
      const t = await call('POST', { action: 'test' })
      setStatus(t)
      setNotice({ ok: !!t.check?.ok, text: t.check?.message ?? 'Test finished' })
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const features = status ? (Object.keys(status.caps_usd) as Feature[]) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">AI settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every AI feature in the app runs on {status?.model_label ?? 'Claude Sonnet 5.5'}. The API key is set on the server, not here.
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
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${status.configured ? 'bg-sage/15 text-sage-dark' : 'bg-gray-100 text-ink-muted'}`}>
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-ink">{status.configured ? 'AI is on' : 'AI is off'}</p>
                <p className="text-sm text-ink-muted">
                  {status.configured
                    ? <>Key ••••{status.key_last4 ?? '????'} from ANTHROPIC_API_KEY · model <span className="font-mono">{status.model}</span> (fixed)</>
                    : <>No API key yet. Users see a message that AI features aren&apos;t turned on.</>}
                </p>
              </div>
            </div>
            <button
              onClick={test}
              disabled={testing || !status.configured}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-ink hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Test connection
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

      {/* Spend */}
      {status && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Today&apos;s spend</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {dayLabel(status.day)}, Jakarta time. Resets at 00:00 WIB.
          </p>
          {status.spend_today_usd === null ? (
            <p className="mt-3 text-sm text-red-600">Couldn&apos;t read the usage log.</p>
          ) : (
            <>
              <p className="mt-3 text-3xl font-bold text-ink">{usd(status.spend_today_usd)}</p>
              <p className="text-xs text-ink-muted">
                {status.calls_today === 1 ? '1 call' : `${status.calls_today ?? 0} calls`} across all couples
              </p>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-muted">
                    <th className="pb-2 font-semibold">Feature</th>
                    <th className="pb-2 text-right font-semibold">Today</th>
                    <th className="pb-2 text-right font-semibold">Limit per couple</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f} className="border-t border-gray-100">
                      <td className="py-2 text-ink">{FEATURE_LABELS[f] ?? f}</td>
                      <td className="py-2 text-right font-mono text-ink">{usd(status.spend_by_feature?.[f] ?? 0)}</td>
                      <td className="py-2 text-right font-mono text-ink-muted">{usd(status.caps_usd[f])}/day</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Key */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <KeyRound className="h-5 w-5 text-rose" /> Changing the API key
        </h2>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-ink-muted">
          <li>Create a key in the Claude Console and give it a monthly spend limit.</li>
          <li>Set it as ANTHROPIC_API_KEY in Vercel (Settings, Environment Variables), server only.</li>
          <li>Redeploy, then come back here and press Test connection.</li>
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          Each couple also has a daily spend limit per feature (the table above). When a couple reaches it, that feature asks them to try again tomorrow.
        </p>
      </div>
    </div>
  )
}
