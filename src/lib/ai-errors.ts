// Maps a failed Claude call (src/lib/claude.ts) to the HTTP status and the
// English message the /api/ai/* routes and Admin → AI show. Server-only.
import type { ClaudeFailure } from '@/lib/claude'

/** No ANTHROPIC_API_KEY: the feature is off and nothing is sent anywhere. */
export const AI_NOT_CONFIGURED = { status: 503, error: 'AI features aren\'t turned on yet' } as const

export const AI_KEY_INVALID = 'The AI isn\'t set up correctly yet'
export const AI_CREDITS_EXHAUSTED = 'The AI has run out of credits for now'
export const AI_BUSY = 'The AI is busy. Try again in a moment.'
export const AI_SLOW = 'The AI is taking too long right now. Try again in a moment.'
export const AI_DAILY_LIMIT = 'You\'ve reached today\'s AI limit for this. Try again tomorrow.'

export type AiFailure = { status: number; error: string }

export type AiMessages = {
  /** The feature's own "try again" line: refusals, network and server errors. */
  retry: string
  /** The answer came back but wasn't usable (wrong shape, cut off). Defaults to `retry`. */
  invalid?: string
  /** The couple hit today's spend cap for this feature. Defaults to AI_DAILY_LIMIT. */
  cap?: string
}

/** Failed call → response. */
export function aiFailure(failure: ClaudeFailure, messages: AiMessages): AiFailure {
  switch (failure.reason) {
    case 'no_key':
      return { ...AI_NOT_CONFIGURED }
    case 'cap':
      return { status: 429, error: messages.cap ?? AI_DAILY_LIMIT }
    case 'timeout':
      return { status: 504, error: AI_SLOW }
    case 'invalid':
      return { status: 502, error: messages.invalid ?? messages.retry }
    case 'refusal':
      return { status: 502, error: messages.retry }
    case 'error':
      switch (failure.detail) {
        case 'http_401':
        case 'http_403':
          return { status: 503, error: AI_KEY_INVALID }
        case 'http_402':
          return { status: 503, error: AI_CREDITS_EXHAUSTED }
        case 'http_429':
        case 'http_529':
        case 'busy':
          return { status: 429, error: AI_BUSY }
        default:
          return { status: 502, error: messages.retry }
      }
  }
}

/** Whether the failure is worth an error log line (expected limits are not). */
export function shouldLogFailure(failure: ClaudeFailure): boolean {
  return failure.reason !== 'no_key' && failure.reason !== 'cap' && failure.detail !== 'busy'
}

/** One log line, without the prompt (it carries the couple's data) or the key. */
export function describeAiFailure(failure: ClaudeFailure): string {
  return failure.detail ? `${failure.reason} (${failure.detail})` : failure.reason
}
