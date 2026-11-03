// A local OpenAI-compatible server (node:http) for offline tests: records
// every request and answers from a queue of canned replies.
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export type RecordedRequest = {
  method: string
  path: string
  headers: IncomingHttpHeaders
  // Parsed JSON body (shape depends on the endpoint).
  body: Record<string, unknown> | null
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

/** A successful chat completion whose assistant message is `content`. */
export function chatCompletion(content: string, finishReason = 'stop'): Reply {
  return {
    json: {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1_790_000_000,
      model: 'openai/gpt-6-luna',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
    },
  }
}

/** An OpenRouter-style error body. `retry-after-ms` keeps SDK retries fast. */
export function apiError(status: number, message: string): Reply {
  return {
    status,
    headers: { 'retry-after-ms': '1' },
    json: { error: { code: status, message } },
  }
}

export async function startFakeOpenAI() {
  const requests: RecordedRequest[] = []
  const queue: Reply[] = []
  let fallback: Reply = apiError(500, 'no reply queued')

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> | null = null
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
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
    /** Base URL as configured in LLM_BASE_URL (OpenRouter style, with /api/v1). */
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
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
      fallback = apiError(500, 'no reply queued')
    },
    close() {
      server.closeAllConnections()
      return new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export type FakeOpenAI = Awaited<ReturnType<typeof startFakeOpenAI>>
