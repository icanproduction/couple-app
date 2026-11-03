// Maps LLM provider failures (OpenRouter via the ai SDK) to friendly
// Indonesian messages and HTTP statuses for the /api/ai/* routes.
// Server-only.
import { APICallError, RetryError } from 'ai'
import { LlmNotConfiguredError } from '@/lib/llm'

/** No LLM_API_KEY: the feature is off and nothing is sent anywhere. */
export const AI_NOT_CONFIGURED = { status: 503, error: 'Fitur AI belum diaktifkan' } as const

export const AI_KEY_INVALID = 'AI belum dikonfigurasi dengan benar'
export const AI_CREDITS_EXHAUSTED = 'Kuota AI sedang habis'
export const AI_BUSY = 'AI sedang sibuk, coba lagi sebentar'

export type AiFailure = { status: number; error: string }

/** After retries the SDK throws a RetryError; the last attempt says what happened. */
function unwrap(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null &&
    ['TimeoutError', 'AbortError'].includes((error as { name?: unknown }).name as string)
  )
}

/**
 * Provider failure → response. `fallback` is the feature's own "try again"
 * message for timeouts, network errors, 5xx and other API errors (502).
 * Returns null when the error did not come from the provider call.
 */
export function providerFailure(error: unknown, fallback: string): AiFailure | null {
  const err = unwrap(error)
  if (err instanceof LlmNotConfiguredError) return { ...AI_NOT_CONFIGURED }
  if (APICallError.isInstance(err)) {
    switch (err.statusCode) {
      case 401:
      case 403:
        return { status: 503, error: AI_KEY_INVALID }
      case 402:
        return { status: 503, error: AI_CREDITS_EXHAUSTED }
      case 429:
        return { status: 429, error: AI_BUSY }
      default:
        return { status: 502, error: fallback }
    }
  }
  if (isTimeout(err)) return { status: 502, error: fallback }
  return null
}

/** One log line without the request body (it carries the couple's data). */
export function describeProviderError(error: unknown): string {
  const err = unwrap(error)
  if (APICallError.isInstance(err)) return `HTTP ${err.statusCode ?? '-'} ${err.message}`
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}
