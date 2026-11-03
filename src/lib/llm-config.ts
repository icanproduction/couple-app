// Runtime LLM settings for the AI routes. Server-only.
//
// A key pasted in Admin → AI (Supabase Vault, read back through the
// service-role RPC llm_runtime_config) wins over LLM_API_KEY; a model set
// there wins over LLM_MODEL_SYNTHESIS. If the lookup fails, the env settings
// are used, so a database hiccup never takes the AI down when env is set.
import { generateText } from 'ai'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLlm, envLlmSettings, type Llm } from '@/lib/llm'
import { providerOptionsFor } from '@/lib/llm-provider/provider'
import { describeProviderError, providerFailure } from '@/lib/ai-errors'

const CACHE_MS = 60_000
let cached: { at: number; llm: Llm; source: LlmSource } | null = null

/** Where the key in use came from. */
export type LlmSource = 'admin' | 'env' | 'none'

/** Call after the admin changes the key or model (same server instance). */
export function forgetLlmConfig() {
  cached = null
}

export async function getLlmWithSource(): Promise<{ llm: Llm; source: LlmSource }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached
  const env = envLlmSettings()
  let apiKey = env.apiKey
  let model = env.model
  let source: LlmSource = env.apiKey.trim() ? 'env' : 'none'
  try {
    const { data, error } = await createServiceRoleClient().rpc('llm_runtime_config')
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (row?.api_key) {
      apiKey = row.api_key
      source = 'admin'
    }
    if (row?.model) model = row.model
  } catch (err) {
    console.error('[llm] admin settings lookup failed, using env:', err)
  }
  cached = { at: Date.now(), llm: createLlm({ ...env, apiKey, model }), source }
  return cached
}

export async function getLlm(): Promise<Llm> {
  return (await getLlmWithSource()).llm
}

export type LlmCheck = { ok: boolean; message: string; latencyMs: number }

/**
 * "Tes koneksi": one tiny request with the given settings. Never throws; the
 * message is safe to show an admin (no key in it).
 */
export async function checkLlmConnection(llm: Llm, { timeoutMs = 30_000 } = {}): Promise<LlmCheck> {
  const started = Date.now()
  if (!llm.configured) {
    return { ok: false, message: 'Belum ada API key. Tempel key OpenRouter dulu.', latencyMs: 0 }
  }
  try {
    const result = await generateText({
      model: llm.model(),
      prompt: 'Balas hanya dengan satu kata: OK',
      maxOutputTokens: 512,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
      providerOptions: providerOptionsFor('low'),
    })
    const latencyMs = Date.now() - started
    return {
      ok: true,
      message: `Terhubung ke ${llm.modelId} (${(latencyMs / 1000).toFixed(1)} dtk). Jawaban: "${result.text.trim().slice(0, 40)}"`,
      latencyMs,
    }
  } catch (err) {
    const failure = providerFailure(err, 'Tidak bisa menghubungi OpenRouter')
    console.error('[llm] connection check failed:', describeProviderError(err))
    return { ok: false, message: failure?.error ?? 'Tidak bisa menghubungi OpenRouter', latencyMs: Date.now() - started }
  }
}
