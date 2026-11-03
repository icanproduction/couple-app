import { describe, expect, it, vi } from "vitest";
import { createEmbedder, toPgVector } from "./embeddings";

const DIM = 1024;
const vec = (seed: number, dim = DIM) => Array.from({ length: dim }, (_, i) => (i === 0 ? seed : 0));
const okResponse = (n: number, offset = 0, dim = DIM) => ({
  ok: true, status: 200,
  json: async () => ({
    data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: vec(offset + i, dim) })),
    usage: { prompt_tokens: n * 10, total_tokens: n * 10 },
  }),
  text: async () => "",
}) as unknown as Response;
const fail = (status: number, body = "err") => ({ ok: false, status, text: async () => body }) as unknown as Response;

const cfg = { baseUrl: "https://emb.example/api/v1/", apiKey: "k", model: "baai/bge-m3", dim: DIM };
const noSleep = async () => {};

describe("createEmbedder (batch + retry + dimension check)", () => {
  it("posts to {base}/embeddings with bearer key and model", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://emb.example/api/v1/embeddings");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer k");
      expect(JSON.parse(String(init!.body)).model).toBe("baai/bge-m3");
      return okResponse(1);
    });
    await createEmbedder(cfg, { fetchImpl, sleep: noSleep }).embed(["a"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("splits 150 texts into 64/64/22 by default and keeps order", async () => {
    const calls: number[] = [];
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const n = (JSON.parse(String(init!.body)).input as string[]).length;
      calls.push(n);
      return okResponse(n, calls.length * 100);
    });
    const out = await createEmbedder(cfg, { fetchImpl, sleep: noSleep }).embed(Array.from({ length: 150 }, (_, i) => `t${i}`));
    expect(calls).toEqual([64, 64, 22]);
    expect(out.length).toBe(150);
    expect(out[0][0]).toBe(100);
    expect(out[64][0]).toBe(200);
    expect(out[149][0]).toBe(321);
  });

  it("honours a custom batch size (32/32/6 for 70 texts)", async () => {
    const calls: number[] = [];
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const n = (JSON.parse(String(init!.body)).input as string[]).length;
      calls.push(n);
      return okResponse(n);
    });
    await createEmbedder(cfg, { fetchImpl, sleep: noSleep, batchSize: 32 }).embed(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(calls).toEqual([32, 32, 6]);
  });

  it("reports usage per batch", async () => {
    const usage: number[] = [];
    const fetchImpl = vi.fn(async () => okResponse(3));
    await createEmbedder(cfg, { fetchImpl, sleep: noSleep, onUsage: u => usage.push(u.totalTokens) }).embed(["a", "b", "c"]);
    expect(usage).toEqual([30]);
  });

  it("retries on 429 then succeeds, with exponential backoff", async () => {
    let n = 0;
    const waits: number[] = [];
    const fetchImpl = vi.fn(async () => (++n === 1 ? fail(429, "rate") : okResponse(1)));
    const out = await createEmbedder(cfg, { fetchImpl, retries: 2, sleep: async ms => { waits.push(ms); } }).embed(["a"]);
    expect(out[0].length).toBe(DIM);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([500]);
  });

  it("gives up after retries with an error naming the status", async () => {
    const fetchImpl = vi.fn(async () => fail(500, "boom"));
    await expect(createEmbedder(cfg, { fetchImpl, retries: 1, sleep: noSleep }).embed(["a"])).rejects.toThrow(/embeddings 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    const fetchImpl = vi.fn(async () => fail(400, "bad"));
    await expect(createEmbedder(cfg, { fetchImpl, retries: 3, sleep: noSleep }).embed(["a"])).rejects.toThrow(/embeddings 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects vectors whose dimension differs from cfg.dim, and does not retry (deterministic response shape error)", async () => {
    const fetchImpl = vi.fn(async () => okResponse(1, 0, 768));
    await expect(createEmbedder(cfg, { fetchImpl, retries: 3, sleep: noSleep }).embed(["a"])).rejects.toThrow(/dimension 1024/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips the dimension check when cfg.dim is not set", async () => {
    const fetchImpl = vi.fn(async () => okResponse(1, 0, 768));
    const out = await createEmbedder({ ...cfg, dim: undefined }, { fetchImpl, sleep: noSleep }).embed(["a"]);
    expect(out[0].length).toBe(768);
  });

  it("rejects a response with a different vector count, and does not retry (deterministic response shape error)", async () => {
    const fetchImpl = vi.fn(async () => okResponse(1));
    await expect(createEmbedder(cfg, { fetchImpl, retries: 3, sleep: noSleep }).embed(["a", "b"])).rejects.toThrow(/expected 2 vectors/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("empty input makes no request", async () => {
    const fetchImpl = vi.fn(async () => okResponse(0));
    expect(await createEmbedder(cfg, { fetchImpl, sleep: noSleep }).embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-positive batchSize at construction (fails loudly, not with an infinite loop)", () => {
    expect(() => createEmbedder(cfg, { batchSize: 0 })).toThrow(/batchSize/);
    expect(() => createEmbedder(cfg, { batchSize: -5 })).toThrow(/batchSize/);
  });

  it("rejects a NaN or fractional batchSize at construction (NaN <= 0 is false, so a plain sign check lets it through)", () => {
    expect(() => createEmbedder(cfg, { batchSize: Number.NaN })).toThrow(/batchSize/);
    expect(() => createEmbedder(cfg, { batchSize: 2.5 })).toThrow(/batchSize/);
  });

  it("embedOne returns one vector; toPgVector formats for pg", async () => {
    const fetchImpl = vi.fn(async () => okResponse(1, 7));
    const v = await createEmbedder(cfg, { fetchImpl, sleep: noSleep }).embedOne("x");
    expect(v[0]).toBe(7);
    expect(toPgVector([1, 2.5, -3])).toBe("[1,2.5,-3]");
  });
});
