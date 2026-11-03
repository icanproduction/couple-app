import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT_LIMIT, DEFAULT_PRICES, FALLBACK_PRICE, contextLimitOf, costOfUsage } from "./pricing";
import { fetchCredits } from "./credits";

describe("costOfUsage", () => {
  it("sums tokens and cost across models (1M tokens = the per-million rate)", () => {
    const r = costOfUsage([
      { model: "deepseek/deepseek-v4-flash", tokensIn: 1_000_000, tokensOut: 1_000_000 },
      { model: "z-ai/glm-4.7-flash", tokensIn: 500_000, tokensOut: null },
    ]);
    expect(r.tokensIn).toBe(1_500_000);
    expect(r.tokensOut).toBe(1_000_000);
    expect(r.usd).toBeCloseTo(0.14 + 0.28 + 0.06 / 2, 10);
  });

  it("null-safe: a row without usage counts 0, not NaN", () => {
    expect(costOfUsage([{ model: "deepseek/deepseek-v3.2", tokensIn: null, tokensOut: null }])).toEqual({ tokensIn: 0, tokensOut: 0, usd: 0 });
  });

  it("unknown models use the conservative fallback rate, not $0", () => {
    const r = costOfUsage([{ model: "vendor/new-model", tokensIn: 1_000_000, tokensOut: 1_000_000 }]);
    expect(DEFAULT_PRICES["vendor/new-model"]).toBeUndefined();
    expect(r.usd).toBeCloseTo(FALLBACK_PRICE.inPerM + FALLBACK_PRICE.outPerM, 10);
  });

  it("accepts an app-specific price table", () => {
    const r = costOfUsage([{ model: "m/x", tokensIn: 1_000_000, tokensOut: 0 }], { "m/x": { inPerM: 2, outPerM: 4 } });
    expect(r.usd).toBeCloseTo(2, 10);
  });

  it("empty list is all zeros", () => {
    expect(costOfUsage([])).toEqual({ tokensIn: 0, tokensOut: 0, usd: 0 });
  });
});

describe("contextLimitOf", () => {
  it("defaults to 128k for every model unless a limit is given", () => {
    expect(DEFAULT_CONTEXT_LIMIT).toBe(128_000);
    for (const model of Object.keys(DEFAULT_PRICES)) expect(contextLimitOf(model)).toBe(128_000);
    expect(contextLimitOf("vendor/new-model")).toBe(128_000);
    expect(contextLimitOf("big/model", { "big/model": 1_000_000 })).toBe(1_000_000);
  });
});

describe("fetchCredits", () => {
  it("reads total credits and usage from {base}/credits with the bearer key", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://llm.example/api/v1/credits");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer k");
      return new Response(JSON.stringify({ data: { total_credits: 20, total_usage: 3.5 } }));
    });
    expect(await fetchCredits({ baseUrl: "https://llm.example/api/v1/", apiKey: "k", fetchImpl })).toEqual({ totalCredits: 20, totalUsage: 3.5 });
  });

  it("returns null on error (dashboard shows 'unavailable', never crashes)", async () => {
    expect(await fetchCredits({ baseUrl: "https://x", apiKey: "k", fetchImpl: async () => new Response("", { status: 401 }) })).toBeNull();
    expect(await fetchCredits({ baseUrl: "https://x", apiKey: "k", fetchImpl: async () => { throw new Error("offline"); } })).toBeNull();
  });
});
