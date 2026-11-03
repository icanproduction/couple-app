// LLM wiring (GPT Luna via OpenRouter). Server-only, and the ONLY file that
// reads the LLM_* env vars (documented in .env.example).
//
// The provider comes from the Otium module library (src/lib/llm-provider/,
// see its MODULE.md). Import its files directly, never the barrel
// "./llm-provider": the barrel re-exports answer-cache.ts, which pulls
// node:crypto. Never import this file from a client component either.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createLlmProvider, resolveModelIds } from './llm-provider/provider'

export const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1'
/**
 * Pinned on purpose. Never use the ~openai/gpt-luna-latest alias: what it
 * points to changes silently.
 */
export const DEFAULT_LLM_MODEL = 'openai/gpt-6-luna'

export type LlmSettings = {
  /** OpenAI-compatible base URL; empty → OpenRouter. */
  baseUrl: string
  /** Empty → `configured: false`, and no feature calls the network. */
  apiKey: string
  /** Model id sent to the API and stored in ai_daily_questions.generated_by. */
  model: string
  /** Retries for network errors, 429 and 5xx (the ai SDK default is 2). */
  maxRetries?: number
}

/** Thrown before any network call when no API key is set. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super('LLM_API_KEY is not set')
    this.name = 'LlmNotConfiguredError'
  }
}

/** Factory: tests point it at a fake server; the app uses `llm` below. */
export function createLlm({ baseUrl, apiKey, model, maxRetries = 2 }: LlmSettings) {
  const key = apiKey.trim()
  const modelId = model.trim() || DEFAULT_LLM_MODEL
  // Both features write text people read, so they share one model id for
  // every role of the module's provider.
  const provider = createLlmProvider(
    {
      baseUrl: baseUrl.trim() || DEFAULT_LLM_BASE_URL,
      apiKey: key,
      models: { router: modelId, synthesis: modelId, narrator: modelId },
    },
    { createOpenAICompatible },
  )
  return {
    /** false = no API key: routes answer 503 without calling the API. */
    configured: key.length > 0,
    modelId,
    maxRetries,
    /** Language model for user-facing text (the module's "synthesis" role). */
    model: () => provider.synthesis(),
  }
}

export type Llm = ReturnType<typeof createLlm>

/** Settings from env (the fallback when Admin → AI holds no key). */
export function envLlmSettings(): LlmSettings {
  return {
    baseUrl: process.env.LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY ?? '',
    // Module convention: LLM_MODEL_SYNTHESIS overrides the model for this role.
    model: resolveModelIds(
      { LLM_MODEL_SYNTHESIS: process.env.LLM_MODEL_SYNTHESIS },
      { router: DEFAULT_LLM_MODEL, synthesis: DEFAULT_LLM_MODEL },
    ).synthesis,
  }
}

/**
 * Env-only instance. Construction is lazy and never throws. The AI routes use
 * getLlm() from ./llm-config instead, which also reads the key pasted in
 * Admin → AI.
 */
export const llm = createLlm(envLlmSettings())
