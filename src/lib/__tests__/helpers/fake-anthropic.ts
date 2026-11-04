// A local stand-in for the Claude Messages API (node:http on 127.0.0.1) for
// offline tests: records every request and answers from a queue of canned
// replies. Point the SDK at it with ANTHROPIC_BASE_URL = fake.baseUrl.
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export type RecordedRequest = {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: MessagesRequestBody | null
}

/** The part of a POST /v1/messages body the tests inspect. */
export type MessagesRequestBody = {
  model?: string
  max_tokens?: number
  system?: string | Array<{ type: string; text: string; cache_control?: { type: string } }>
  messages?: Array<{ role: string; content: unknown }>
  thinking?: unknown
  fallbacks?: unknown
  output_config?: { effort?: string; format?: { type: string; schema: Record<string, unknown> } }
  [key: string]: unknown
}

export type Reply = {
  status?: number
  headers?: Record<string, string>
  json?: unknown
  /** Raw body instead of `json`. */
  text?: string
  /** Wait this long before answering (timeout tests). */
  delayMs?: number
}

export type UsageReply = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** A successful Messages API response whose text block is `text`. */
export function message(
  text: string,
  { stopReason = 'end_turn', usage = {}, category = null }: { stopReason?: string; usage?: UsageReply; category?: string | null } = {},
): Reply {
  return {
    json: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [
        // Adaptive thinking with the default "omitted" display: an empty block first.
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text },
      ],
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: stopReason === 'refusal' ? { type: 'refusal', category, explanation: null } : null,
      usage: {
        input_tokens: 400,
        output_tokens: 60,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        ...usage,
      },
    },
  }
}

/** A JSON answer: what structured output returns as the text block. */
export function jsonMessage(data: unknown, usage?: UsageReply): Reply {
  return message(JSON.stringify(data), { usage })
}

/** An API error body. `retry-after-ms` keeps SDK retries fast. */
export function apiError(status: number, type = 'api_error', text = 'upstream error'): Reply {
  return {
    status,
    headers: { 'retry-after-ms': '1' },
    json: { type: 'error', error: { type, message: text } },
  }
}

export async function startFakeAnthropic() {
  const requests: RecordedRequest[] = []
  const queue: Reply[] = []
  let fallback: Reply = apiError(500, 'api_error', 'no reply queued')

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: MessagesRequestBody | null = null
      try {
        body = raw ? (JSON.parse(raw) as MessagesRequestBody) : null
      } catch {
        body = null
      }
      requests.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body })

      const reply = queue.shift() ?? fallback
      const send = () => {
        if (res.destroyed) return
        const payload = reply.text ?? JSON.stringify(reply.json ?? {})
        res.writeHead(reply.status ?? 200, {
          'content-type': reply.text !== undefined ? 'text/plain' : 'application/json',
          ...reply.headers,
        })
        res.end(payload)
      }
      if (reply.delayMs) setTimeout(send, reply.delayMs)
      else send()
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    /** Value for ANTHROPIC_BASE_URL (the SDK appends /v1/messages). */
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    /** Queue replies, answered in order. */
    reply(...replies: Reply[]) {
      queue.push(...replies)
    },
    /** Reply used once the queue is empty. */
    always(reply: Reply) {
      fallback = reply
    },
    reset() {
      requests.length = 0
      queue.length = 0
      fallback = apiError(500, 'api_error', 'no reply queued')
    },
    close() {
      server.closeAllConnections()
      return new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export type FakeAnthropic = Awaited<ReturnType<typeof startFakeAnthropic>>
