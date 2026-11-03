import type { Price, UsageRow } from "./types";

// Tabel harga & batas konteks — murni data + hitung, tanpa dependency, aman diimpor komponen
// klien maupun server. Harga = snapshot OpenRouter (USD per JUTA token), taksiran untuk strip
// biaya sesi di UI, bukan angka billing. Upstream berubah → perbarui tabel ini (atau kirim
// tabel sendiri); jangan jadikan fetch runtime, strip harus jalan offline.

export const DEFAULT_PRICES: Record<string, Price> = {
  "deepseek/deepseek-v4-flash": { inPerM: 0.14, outPerM: 0.28 },
  "deepseek/deepseek-v3.2": { inPerM: 0.269, outPerM: 0.4 },
  "z-ai/glm-4.7-flash": { inPerM: 0.06, outPerM: 0.4 },
  "meta-llama/llama-3.3-70b-instruct": { inPerM: 0.1, outPerM: 0.32 },
  "meta-llama/llama-3.1-8b-instruct": { inPerM: 0.05, outPerM: 0.08 },
  "deepseek/deepseek-v4-flash-0731": { inPerM: 0.065, outPerM: 0.18 },
  "z-ai/glm-5.3": { inPerM: 1.4, outPerM: 4.4 },
  "z-ai/glm-5.3-flash": { inPerM: 0.075, outPerM: 0.25 },
  "anthropic/claude-sonnet-5": { inPerM: 2, outPerM: 10 },
  "xiaomi/mimo-v2.5": { inPerM: 0.14, outPerM: 0.28 },
  "openai/gpt-5.6-luna": { inPerM: 0.2, outPerM: 1.2 },
};

/** Model di luar tabel tetap dihitung dengan tarif konservatif: lebih baik menaksir kemahalan daripada diam-diam $0. */
export const FALLBACK_PRICE: Price = { inPerM: 0.3, outPerM: 1.0 };

/** Batang "seberapa penuh" di strip sesi, bukan batas asli model (banyak model 1M+). */
export const DEFAULT_CONTEXT_LIMIT = 128_000;

export const contextLimitOf = (model: string, limits: Record<string, number> = {}, fallback = DEFAULT_CONTEXT_LIMIT) =>
  limits[model] ?? fallback;

/** Total token + biaya. tokensIn/tokensOut null (upstream tidak selalu kirim usage) dihitung 0, bukan NaN. */
export function costOfUsage(
  rows: UsageRow[],
  prices: Record<string, Price> = DEFAULT_PRICES,
  fallback: Price = FALLBACK_PRICE,
): { tokensIn: number; tokensOut: number; usd: number } {
  let tokensIn = 0;
  let tokensOut = 0;
  let usd = 0;
  for (const r of rows) {
    const price = prices[r.model] ?? fallback;
    const tin = r.tokensIn ?? 0;
    const tout = r.tokensOut ?? 0;
    tokensIn += tin;
    tokensOut += tout;
    usd += (tin * price.inPerM + tout * price.outPerM) / 1_000_000;
  }
  return { tokensIn, tokensOut, usd };
}
