// The app's one AI client: Claude Sonnet 5.5 through the official Anthropic
// SDK. Server-only, and the ONLY file that reads ANTHROPIC_API_KEY. Never
// import it from a client component: it carries the key, the prompts' plumbing
// and the usage ledger.
//
// Every feature calls claudeJson(). In order, it:
//   1. answers { ok: false, reason: 'no_key' } without any network call when
//      ANTHROPIC_API_KEY is empty,
//   2. atomically checks the couple's spend for that feature today (Asia/Jakarta
//      day) against AI_DAILY_CAP_USD and reserves the call's worst-case cost in
//      ai_usage (RPC ai_usage_reserve). At or over the cap: reason 'cap', no
//      call. Under the cap but with other calls for the same couple and
//      feature in flight that could use the rest: reason 'error', detail
//      'busy' (try again in a moment),
//   3. calls Sonnet once (adaptive thinking at effort "low", structured JSON
//      output, prompt caching on the system prompt when asked),
//   4. replaces the reservation with the real cost from the API's usage numbers
//      and the outcome, then parses and validates the JSON against the schema.
// Refusals are soft failures: no fallback to any other model (Sonnet only).
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { todayJakarta } from '@/lib/dates'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/claude.ts is server-only')
}

/** The only model the app uses. Pinned id, never an alias. */
export const SONNET = 'claude-sonnet-5-5'
export const SONNET_LABEL = 'Claude Sonnet 5.5'

/** Claude API list prices for Sonnet 5.5, USD per million tokens. */
export const SONNET_PRICE_PER_MTOK = {
  input: 2,
  output: 10,
  cacheRead: 0.2,
  cacheWrite5m: 2.5,
  cacheWrite1h: 4,
} as const

export type AiFeature =
  | 'daily_question'
  | 'date_ideas'
  | 'pet_note'
  | 'pet_weekly'
  | 'samakan_set'
  | 'samakan_readout'

/** Same list as the ai_usage.feature CHECK constraint. */
export const AI_FEATURES: readonly AiFeature[] = [
  'daily_question', 'date_ideas', 'pet_note', 'pet_weekly', 'samakan_set', 'samakan_readout',
]

/** Spend limit per couple, per feature, per Asia/Jakarta day, in USD. */
export const AI_DAILY_CAP_USD: Readonly<Record<AiFeature, number>> = {
  daily_question: 0.006,
  // 5 runs a day: measured ~$0.0084 first run, ~$0.0054 cached (2026-11-04).
  date_ideas: 0.04,
  pet_note: 0.015,
  pet_weekly: 0.01,
  samakan_set: 0.02,
  samakan_readout: 0.008,
}

export const CLAUDE_DEFAULT_TIMEOUT_MS = 30_000
/** SDK retries (429, 529, 5xx, connection errors), all inside timeoutMs. */
const MAX_RETRIES = 2
/** Ceiling for maxTokens: these are short JSON answers on non-streaming requests. */
export const MAX_TOKENS_LIMIT = 8192

export type ClaudeFailureReason = 'no_key' | 'cap' | 'refusal' | 'timeout' | 'invalid' | 'error'

/**
 * A failed call. `detail` is a short diagnostic for server logs (an HTTP
 * status, the first schema error); it never holds the key or prompt text.
 */
export type ClaudeFailure = { ok: false; reason: ClaudeFailureReason; detail?: string }

export type ClaudeUsage = {
  /** All input tokens: uncached + cache reads + cache writes. */
  input: number
  /** Output tokens, thinking included. */
  output: number
  costUsd: number
}

export type ClaudeJsonResult<T> = { ok: true; data: T; usage: ClaudeUsage } | ClaudeFailure

export type ClaudeJsonOptions = {
  feature: AiFeature
  /** The couple billed for the call. null = admin/system call: logged, never capped. */
  coupleId: string | null
  /** Stable instructions. Keep anything that changes per request in `prompt`. */
  system: string
  /** The per-request user message. */
  prompt: string
  /**
   * JSON Schema for the answer (root type "object"). Sent as structured output
   * after dropping what the API can't enforce (minLength, maxLength, minimum,
   * maximum, maxItems, minItems above 1, pattern...); those are folded into the
   * description for the model and checked here after parsing, so a violating
   * answer comes back as reason 'invalid'.
   */
  schema: Record<string, unknown>
  /** Output ceiling, thinking included (1 to MAX_TOKENS_LIMIT). Also sets the reserved worst-case cost. */
  maxTokens: number
  /** Whole call, retries included. Default 30 s. */
  timeoutMs?: number
  /** Cache the system prompt (5 minutes). Pays off only when calls repeat within minutes. */
  cacheSystem?: boolean
}

// ---- Key ------------------------------------------------------------------

function apiKey(): string {
  return process.env.ANTHROPIC_API_KEY?.trim() ?? ''
}

/** True when ANTHROPIC_API_KEY is set. No network call. */
export function claudeConfigured(): boolean {
  return apiKey().length > 0
}

/** Last 4 characters of the key, for the admin page. Never more. */
export function claudeKeyLast4(): string | null {
  const key = apiKey()
  return key.length >= 8 ? key.slice(-4) : null
}

function newClient(key: string): Anthropic {
  // Explicit key and no auth token: credentials never come from anywhere else
  // on the machine (an `ant auth login` profile, ANTHROPIC_AUTH_TOKEN).
  return new Anthropic({ apiKey: key, authToken: null, maxRetries: MAX_RETRIES })
}

// ---- Cost -----------------------------------------------------------------

type UsageNumbers = Pick<
  Anthropic.Usage,
  'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens' | 'cache_creation'
>

const roundUsd = (usd: number) => Math.round(usd * 1e6) / 1e6

/** USD for one response's usage at Sonnet 5.5 prices, rounded to 6 decimals. */
export function costUsd(usage: UsageNumbers): number {
  const p = SONNET_PRICE_PER_MTOK
  const write = usage.cache_creation_input_tokens ?? 0
  const write1h = Math.min(usage.cache_creation?.ephemeral_1h_input_tokens ?? 0, write)
  const micro =
    usage.input_tokens * p.input +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (write - write1h) * p.cacheWrite5m +
    write1h * p.cacheWrite1h +
    usage.output_tokens * p.output
  return roundUsd(micro / 1e6)
}

/**
 * Upper bound for one call, reserved while it runs: input counted at roughly
 * 3 characters per token (English averages about 4) plus request overhead, at
 * the cache-write price, and every allowed output token.
 */
export function worstCaseUsd(opts: Pick<ClaudeJsonOptions, 'system' | 'prompt' | 'schema' | 'maxTokens'>): number {
  const chars = opts.system.length + opts.prompt.length + JSON.stringify(opts.schema).length
  const inputTokens = Math.ceil(chars / 3) + 400
  return roundUsd((inputTokens * SONNET_PRICE_PER_MTOK.cacheWrite5m + opts.maxTokens * SONNET_PRICE_PER_MTOK.output) / 1e6)
}

// ---- Ledger (ai_usage, service role only) ----------------------------------

// ai_usage is not in src/types/database.ts until the types are regenerated,
// so the ledger uses an untyped client view.
function ledger(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient
}

const sumCost = (rows: Array<{ cost_usd: number | string | null }> | null) =>
  roundUsd((rows ?? []).reduce((total, r) => total + Number(r.cost_usd ?? 0), 0))

/**
 * What a couple has spent on `feature` today (Asia/Jakarta day), in USD,
 * calls in flight included at their reserved cost. Throws on a database error.
 */
export async function aiSpendToday(coupleId: string, feature: AiFeature): Promise<number> {
  const { data, error } = await ledger()
    .from('ai_usage')
    .select('cost_usd')
    .eq('couple_id', coupleId)
    .eq('feature', feature)
    .eq('day', todayJakarta())
  if (error) throw new Error(`ai_usage lookup failed: ${error.message}`)
  return sumCost(data)
}

/** Today's spend across all couples (admin page). Throws on a database error. */
export async function aiSpendTodayAll(): Promise<{ totalUsd: number; byFeature: Record<AiFeature, number>; calls: number }> {
  const { data, error } = await ledger()
    .from('ai_usage')
    .select('feature, cost_usd')
    .eq('day', todayJakarta())
  if (error) throw new Error(`ai_usage lookup failed: ${error.message}`)
  const rows = (data ?? []) as Array<{ feature: AiFeature; cost_usd: number | string | null }>
  const byFeature = Object.fromEntries(AI_FEATURES.map((f) => [f, 0])) as Record<AiFeature, number>
  for (const row of rows) {
    if (row.feature in byFeature) byFeature[row.feature] = roundUsd(byFeature[row.feature] + Number(row.cost_usd ?? 0))
  }
  return { totalUsd: sumCost(rows), byFeature, calls: rows.length }
}

type Outcome = 'ok' | 'refusal' | 'invalid' | 'timeout' | 'error'

type Settlement = {
  outcome: Outcome
  usage?: UsageNumbers
  /** Set to 0 when the API answered with an error status (not billed). */
  zeroCost?: boolean
}

/** Replace the reservation with what really happened. Logged, never thrown. */
async function settle(id: string, s: Settlement): Promise<void> {
  const patch: Record<string, unknown> = { outcome: s.outcome }
  if (s.usage) {
    patch.input_tokens = s.usage.input_tokens
    patch.output_tokens = s.usage.output_tokens
    patch.cache_read_tokens = s.usage.cache_read_input_tokens ?? 0
    patch.cache_write_tokens = s.usage.cache_creation_input_tokens ?? 0
    patch.cost_usd = costUsd(s.usage)
  } else if (s.zeroCost) {
    patch.cost_usd = 0
  }
  // Without usage numbers (timeout, unknown error) the reserved worst-case
  // cost stays: the request may have been billed.
  const { error } = await ledger().from('ai_usage').update(patch).eq('id', id)
  if (error) console.error('[claude] usage settle failed:', error.message)
}

// ---- JSON Schema: what the API enforces, and the full check here ------------

const API_STRING_FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'])
type Schema = Record<string, unknown>

/**
 * The schema as structured output accepts it: every object closed
 * (additionalProperties false), oneOf sent as anyOf, and unsupported
 * constraints moved into the description so the model still sees them.
 */
export function toApiSchema(schema: Schema): Schema {
  const s: Schema = { ...schema }
  const out: Schema = {}
  const take = (key: string) => {
    const value = s[key]
    delete s[key]
    return value
  }

  const defs = take('$defs')
  if (defs && typeof defs === 'object') {
    out.$defs = Object.fromEntries(Object.entries(defs as Record<string, Schema>).map(([k, v]) => [k, toApiSchema(v)]))
  }
  const ref = take('$ref')
  if (ref !== undefined) return { ...out, $ref: ref }

  const type = take('type')
  const anyOf = take('anyOf') ?? take('oneOf')
  const allOf = take('allOf')
  if (type !== undefined) out.type = type
  if (Array.isArray(anyOf)) out.anyOf = anyOf.map((v) => toApiSchema(v as Schema))
  if (Array.isArray(allOf)) out.allOf = allOf.map((v) => toApiSchema(v as Schema))
  for (const key of ['title', 'description', 'enum', 'const'] as const) {
    const value = take(key)
    if (value !== undefined) out[key] = value
  }

  const types = Array.isArray(type) ? type : [type]
  if (types.includes('object') || s.properties !== undefined) {
    const props = (take('properties') ?? {}) as Record<string, Schema>
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toApiSchema(v)]))
    const required = take('required')
    if (required !== undefined) out.required = required
    take('additionalProperties')
    out.additionalProperties = false
  }
  if (types.includes('array') || s.items !== undefined) {
    const items = take('items')
    if (items !== undefined) out.items = toApiSchema(items as Schema)
    const minItems = s.minItems
    if (minItems === 0 || minItems === 1) out.minItems = take('minItems')
  }
  if (typeof s.format === 'string' && API_STRING_FORMATS.has(s.format)) out.format = take('format')

  const rest = Object.entries(s)
  if (rest.length) {
    const note = `{${rest.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}}`
    out.description = out.description ? `${out.description}\n\n${note}` : note
  }
  return out
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === 'number' && actual === 'integer')
}

/**
 * The first place `value` breaks `schema`, or null when it fits. Covers the
 * keywords structured output schemas use: type, enum, const, properties,
 * required, additionalProperties, items, min/maxItems, min/maxLength,
 * minimum/maximum (and the exclusive forms), anyOf, allOf and local $refs.
 */
export function schemaError(schema: Schema, value: unknown, path = '$', root: Schema = schema): string | null {
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.replace(/^#\/\$defs\//, '')
    const target = (root.$defs as Record<string, Schema> | undefined)?.[name]
    return target ? schemaError(target, value, path, root) : `${path}: unknown $ref ${schema.$ref}`
  }
  const actual = typeOf(value)
  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    if (!expected.some((t) => typeMatches(t, actual))) return `${path}: expected ${expected.join(' or ')}, got ${actual}`
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) return `${path}: not one of the allowed values`
  if (schema.const !== undefined && schema.const !== value) return `${path}: not the expected constant`
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((s) => schemaError(s as Schema, value, path, root) === null)) {
    return `${path}: matches none of anyOf`
  }
  if (Array.isArray(schema.allOf)) {
    for (const s of schema.allOf) {
      const e = schemaError(s as Schema, value, path, root)
      if (e) return e
    }
  }
  if (actual === 'string') {
    const text = value as string
    if (typeof schema.minLength === 'number' && text.length < schema.minLength) return `${path}: shorter than ${schema.minLength}`
    if (typeof schema.maxLength === 'number' && text.length > schema.maxLength) return `${path}: longer than ${schema.maxLength}`
  }
  if (actual === 'integer' || actual === 'number') {
    const n = value as number
    if (typeof schema.minimum === 'number' && n < schema.minimum) return `${path}: below ${schema.minimum}`
    if (typeof schema.maximum === 'number' && n > schema.maximum) return `${path}: above ${schema.maximum}`
    if (typeof schema.exclusiveMinimum === 'number' && n <= schema.exclusiveMinimum) return `${path}: not above ${schema.exclusiveMinimum}`
    if (typeof schema.exclusiveMaximum === 'number' && n >= schema.exclusiveMaximum) return `${path}: not below ${schema.exclusiveMaximum}`
  }
  if (actual === 'array') {
    const list = value as unknown[]
    if (typeof schema.minItems === 'number' && list.length < schema.minItems) return `${path}: fewer than ${schema.minItems} items`
    if (typeof schema.maxItems === 'number' && list.length > schema.maxItems) return `${path}: more than ${schema.maxItems} items`
    if (schema.items && typeof schema.items === 'object') {
      for (let i = 0; i < list.length; i++) {
        const e = schemaError(schema.items as Schema, list[i], `${path}[${i}]`, root)
        if (e) return e
      }
    }
  }
  if (actual === 'object') {
    const obj = value as Record<string, unknown>
    const props = (schema.properties ?? {}) as Record<string, Schema>
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) return `${path}.${key}: missing`
    }
    for (const [key, v] of Object.entries(obj)) {
      if (props[key]) {
        const e = schemaError(props[key], v, `${path}.${key}`, root)
        if (e) return e
      } else if (schema.additionalProperties === false || schema.properties !== undefined) {
        // Structured output closes every object, so an unknown key is a bad answer.
        return `${path}.${key}: not allowed`
      }
    }
  }
  return null
}

// ---- The call ---------------------------------------------------------------

function isTimeout(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError
}

/** The user message plus everything around it that every call shares. */
function requestBody(opts: ClaudeJsonOptions): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: SONNET,
    max_tokens: opts.maxTokens,
    // Sonnet 5.5 rejects thinking "disabled"; the param is left out, so
    // adaptive thinking stays on and effort "low" keeps it short.
    system: opts.cacheSystem
      ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }]
      : opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: toApiSchema(opts.schema) },
    },
  }
}

/**
 * One Sonnet call that must answer with JSON matching `schema`. Never throws.
 * Every call that gets past the cap check leaves exactly one ai_usage row.
 */
export async function claudeJson<T>(opts: ClaudeJsonOptions): Promise<ClaudeJsonResult<T>> {
  const key = apiKey()
  if (!key) return { ok: false, reason: 'no_key' }
  if (!AI_FEATURES.includes(opts.feature)) return { ok: false, reason: 'error', detail: `unknown feature ${opts.feature}` }
  if (!Number.isInteger(opts.maxTokens) || opts.maxTokens < 1 || opts.maxTokens > MAX_TOKENS_LIMIT) {
    return { ok: false, reason: 'error', detail: `maxTokens must be an integer from 1 to ${MAX_TOKENS_LIMIT}` }
  }
  const timeoutMs = opts.timeoutMs ?? CLAUDE_DEFAULT_TIMEOUT_MS

  // Build the request first: a broken schema must not cost a reservation.
  let body: Anthropic.MessageCreateParamsNonStreaming
  try {
    body = requestBody(opts)
  } catch (err) {
    return { ok: false, reason: 'error', detail: `bad schema: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Check the cap and reserve in one locked step (see ai_usage_reserve).
  let usageId: string
  try {
    const { data, error } = await ledger().rpc('ai_usage_reserve', {
      p_couple: opts.coupleId,
      p_feature: opts.feature,
      p_cap: opts.coupleId ? AI_DAILY_CAP_USD[opts.feature] : null,
      p_estimate: worstCaseUsd(opts),
    })
    if (error) throw new Error(error.message)
    const reserved = (data ?? {}) as { id?: string; blocked?: 'cap' | 'busy' }
    if (reserved.blocked === 'cap') return { ok: false, reason: 'cap' }
    // Under the cap, but calls already in flight for this couple and feature
    // could use the rest: try again in a moment, not tomorrow.
    if (reserved.blocked === 'busy') return { ok: false, reason: 'error', detail: 'busy' }
    if (typeof reserved.id !== 'string') throw new Error('no reservation id')
    usageId = reserved.id
  } catch (err) {
    // No ledger, no call: an unchecked call could run past the cap.
    return { ok: false, reason: 'error', detail: `usage ledger: ${err instanceof Error ? err.message : String(err)}` }
  }

  let message: Anthropic.Message
  try {
    message = await newClient(key).messages.create(body, {
      timeout: timeoutMs,
      maxRetries: MAX_RETRIES,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (isTimeout(err)) {
      await settle(usageId, { outcome: 'timeout' })
      return { ok: false, reason: 'timeout' }
    }
    if (err instanceof Anthropic.APIConnectionError) {
      // Most likely never reached the API; nothing to bill.
      await settle(usageId, { outcome: 'error', zeroCost: true })
      return { ok: false, reason: 'error', detail: 'connection' }
    }
    if (err instanceof Anthropic.APIError) {
      // The API answered with an error status: not billed.
      await settle(usageId, { outcome: 'error', zeroCost: true })
      return { ok: false, reason: 'error', detail: `http_${err.status ?? 'unknown'}` }
    }
    await settle(usageId, { outcome: 'error' })
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.name : 'unknown' }
  }

  const usage: ClaudeUsage = {
    input:
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    output: message.usage.output_tokens,
    costUsd: costUsd(message.usage),
  }
  const fail = async (reason: 'refusal' | 'invalid', detail?: string): Promise<ClaudeFailure> => {
    await settle(usageId, { outcome: reason, usage: message.usage })
    return { ok: false, reason, ...(detail ? { detail } : {}) }
  }

  if (message.stop_reason === 'refusal') return fail('refusal', message.stop_details?.category ?? undefined)
  if (message.stop_reason === 'max_tokens') return fail('invalid', 'cut off at maxTokens')

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('invalid', 'not JSON')
  }
  let problem: string | null
  try {
    problem = schemaError(opts.schema, data)
  } catch {
    problem = 'could not be checked'
  }
  if (problem) return fail('invalid', `schema ${problem}`)

  await settle(usageId, { outcome: 'ok', usage: message.usage })
  return { ok: true, data: data as T, usage }
}

// ---- Admin: "Test connection" ----------------------------------------------

export type ClaudeCheck = ({ ok: true } | ClaudeFailure) & { latencyMs: number }

/**
 * One tiny Sonnet request (at most 32 output tokens, no couple, not in the
 * ledger) to prove the key works. Never throws.
 */
export async function checkClaudeConnection({ timeoutMs = 20_000 } = {}): Promise<ClaudeCheck> {
  const key = apiKey()
  if (!key) return { ok: false, reason: 'no_key', latencyMs: 0 }
  const started = Date.now()
  try {
    const message = await newClient(key).messages.create(
      {
        model: SONNET,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        output_config: { effort: 'low' },
      },
      { timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) },
    )
    const latencyMs = Date.now() - started
    if (message.stop_reason === 'refusal') return { ok: false, reason: 'refusal', latencyMs }
    return { ok: true, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - started
    if (isTimeout(err)) return { ok: false, reason: 'timeout', latencyMs }
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'error', detail: 'connection', latencyMs }
    if (err instanceof Anthropic.APIError) return { ok: false, reason: 'error', detail: `http_${err.status ?? 'unknown'}`, latencyMs }
    return { ok: false, reason: 'error', detail: 'unknown', latencyMs }
  }
}
