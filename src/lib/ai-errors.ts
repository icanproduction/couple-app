// Maps LLM provider failures (OpenRouter via the ai SDK) to friendly
// English messages and HTTP statuses for the /api/ai/* routes.
// Server-only.
import { APICallError, RetryError } from 'ai'
import { LlmNotConfiguredError } from '@/lib/llm'

/** No LLM_API_KEY: the feature is off and nothing is sent anywhere. */
export const AI_NOT_CONFIGURED = { status: 503, error: 'AI features aren\'t turned on yet' } as const

export const AI_KEY_INVALID = 'The AI isn\'t set up correctly yet'
export const AI_CREDITS_EXHAUSTED = 'The AI has run out of credits for now'
export const AI_BUSY = 'The AI is busy. Try again in a moment.'

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
