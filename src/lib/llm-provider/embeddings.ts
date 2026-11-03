import type { EmbedConfig, EmbedOptions } from "./types";

// Batch + retry: satu dokumen bisa ratusan chunk; satu request raksasa gagal keras di batas
// payload/timeout, dan tanpa retry satu 429 membatalkan semuanya. Endpoint OpenAI-compatible
// `/embeddings` (mis. OpenRouter + baai/bge-m3 → 1024 dimensi).

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type HttpError = Error & { status?: number };

/** Retry untuk error jaringan (tanpa status), 429, dan 5xx. 4xx lain = salah request, jangan diulang. */
const retryable = (e: unknown) => {
  const s = (e as HttpError).status;
  return s === undefined || s === 429 || s >= 500;
};

export function createEmbedder(cfg: EmbedConfig, opts: EmbedOptions = {}) {
  const { batchSize = 64, retries = 3, fetchImpl = fetch, sleep = defaultSleep, onUsage } = opts;
  // Number.isInteger menolak NaN/Infinity/pecahan — `NaN <= 0` bernilai false, jadi cek tanda saja meloloskannya.
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error(`createEmbedder: batchSize must be a positive integer, got ${batchSize}`);
  const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/embeddings`;

  async function embedOnce(texts: string[]): Promise<number[][]> {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, input: texts }),
    });
    if (!res.ok) {
      const err: HttpError = new Error(`embeddings ${res.status}: ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    if (!Array.isArray(json.data) || json.data.length !== texts.length) {
      // Response punya bentuk yang tidak sesuai kontrak (bukan masalah jaringan/rate-limit) —
      // mengulang tidak akan mengubah jumlah vektor yang dikirim upstream, jadi jangan retry.
      const err: HttpError = new Error(`embeddings: expected ${texts.length} vectors, got ${json.data?.length ?? 0}`);
      err.status = 422;
      throw err;
    }
    const vectors = [...json.data].sort((a, b) => a.index - b.index).map(d => d.embedding);
    if (cfg.dim !== undefined) {
      for (const v of vectors) {
        if (!Array.isArray(v) || v.length !== cfg.dim) {
          // Sama alasannya: dimensi salah adalah kesalahan konfigurasi (model tertukar), bukan
          // hiccup jaringan — mengulang hanya membakar kuota tanpa mengubah hasil.
          const err: HttpError = new Error(`embeddings: expected dimension ${cfg.dim}, got ${v?.length ?? 0}`);
          err.status = 422;
          throw err;
        }
      }
    }
    if (json.usage && onUsage) {
      onUsage({ promptTokens: json.usage.prompt_tokens ?? 0, totalTokens: json.usage.total_tokens ?? 0 });
    }
    return vectors;
  }

  async function embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      for (let attempt = 0; ; attempt++) {
        try {
          out.push(...(await embedOnce(batch)));
          break;
        } catch (e) {
          if (attempt >= retries || !retryable(e)) throw e;
          await sleep(500 * 2 ** attempt);
        }
      }
    }
    return out;
  }

  async function embedOne(text: string): Promise<number[]> {
    const [v] = await embed([text]);
    return v;
  }

  return { embed, embedOne };
}

/** Format vektor untuk parameter pg (`$1::vector`) / pgvector. */
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
