import { describe, expect, it, vi } from "vitest";
import {
  accessSignature,
  cacheKey,
  createExactAnswerCache,
  createSemanticAnswerCache,
  isExactCacheable,
  isRouteCacheable,
  normalizeQuestion,
} from "./answer-cache";
import type { AccessIdentity, CacheIdentity, ExactCacheRow, ExactCacheStore, SemanticCacheStore } from "./types";

// ── Semantic strategy: embedding similarity, FAQ first, access signature in the key ──

const who = (p: Partial<AccessIdentity> = {}): AccessIdentity => ({ role: "staff", branchId: null, agent: "a1", domains: null, ...p });

describe("accessSignature — the leak guard", () => {
  it("differs by role, branch, agent, and shelf", () => {
    expect(accessSignature(who({ role: "staff" }))).not.toBe(accessSignature(who({ role: "owner" })));
    expect(accessSignature(who({ role: "manager", branchId: "b1" }))).not.toBe(accessSignature(who({ role: "manager", branchId: "b2" })));
    expect(accessSignature(who({ agent: "a2" }))).not.toBe(accessSignature(who({ agent: "a3" })));
    expect(accessSignature(who({ domains: ["sales"] }))).not.toBe(accessSignature(who({ domains: ["hr"] })));
  });

  it("shelf order does not matter; empty shelf equals null shelf", () => {
    expect(accessSignature(who({ domains: ["sales", "hr"] }))).toBe(accessSignature(who({ domains: ["hr", "sales"] })));
    expect(accessSignature(who({ domains: [] }))).toBe(accessSignature(who({ domains: null })));
  });

  it("always starts with the role (an RLS policy matches `role:%`)", () => {
    expect(accessSignature(who({ role: "owner" })).startsWith("owner:")).toBe(true);
  });

  it("identical identities give identical signatures", () => {
    const x = who({ role: "owner", branchId: "x", agent: "a9", domains: ["finance"] });
    expect(accessSignature(x)).toBe(accessSignature({ ...x }));
  });
});

describe("isRouteCacheable", () => {
  it("only answers built purely from documents are cacheable by default", () => {
    expect(isRouteCacheable(["docs"])).toBe(true);
    expect(isRouteCacheable(["sql"])).toBe(false);
    expect(isRouteCacheable(["docs", "sql"])).toBe(false);
    expect(isRouteCacheable(["graph"])).toBe(false);
    expect(isRouteCacheable([])).toBe(false);
  });

  it("accepts a custom allow-list", () => {
    expect(isRouteCacheable(["docs", "kb"], ["docs", "kb"])).toBe(true);
  });
});

function semanticStore(over: Partial<SemanticCacheStore> = {}): SemanticCacheStore {
  return {
    matchFaq: vi.fn(async () => null),
    matchCached: vi.fn(async () => null),
    insert: vi.fn(async () => {}),
    ...over,
  };
}
const embedOne = vi.fn(async () => [0.1, 0.2]);

/** A logger that itself fails — must never reject a cache call nor leak an unhandled rejection. */
const throwingOnError = () => vi.fn(() => { throw new Error("logger down"); });

/** Runs `fn`, lets fire-and-forget promises settle, returns every unhandled rejection seen meanwhile. */
async function unhandledDuring(fn: () => Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => { seen.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    await fn();
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  return seen;
}

describe("createSemanticAnswerCache", () => {
  it("approved FAQ wins before the automatic cache", async () => {
    const store = semanticStore({ matchFaq: vi.fn(async () => ({ id: "f1", question: "q?", answer: "faq answer", approvedName: "Owner", approvedAt: "2026-09-01" })) });
    const cache = createSemanticAnswerCache({ store, embedOne });
    const r = await cache.lookup("q?", who());
    expect(r.hit).toMatchObject({ kind: "faq", answer: "faq answer", approvedName: "Owner" });
    expect(store.matchCached).not.toHaveBeenCalled();
    expect(r.embedding).toEqual([0.1, 0.2]);
  });

  it("automatic cache is matched with the caller's access signature and thresholds", async () => {
    const store = semanticStore({ matchCached: vi.fn(async () => ({ id: "c1", question: "q", answer: "cached", sources: [{ documentId: "d1" }], createdAt: "t" })) });
    const cache = createSemanticAnswerCache({ store, embedOne });
    const r = await cache.lookup("q", who({ role: "owner" }));
    expect(r.hit).toMatchObject({ kind: "cache", answer: "cached" });
    expect(store.matchFaq).toHaveBeenCalledWith([0.1, 0.2], 0.9);
    expect(store.matchCached).toHaveBeenCalledWith([0.1, 0.2], accessSignature(who({ role: "owner" })), "a1", 0.95);
  });

  it("miss returns the embedding so the caller can store without re-embedding", async () => {
    const r = await createSemanticAnswerCache({ store: semanticStore(), embedOne }).lookup("q", who());
    expect(r).toEqual({ hit: null, embedding: [0.1, 0.2] });
  });

  it("stores only cacheable, non-empty answers that cite at least one document", async () => {
    const store = semanticStore();
    const cache = createSemanticAnswerCache({ store, embedOne });
    await cache.store({ question: "q", embedding: [1], answer: "a", sources: [{ documentId: "d1" }, { documentId: "d1" }], identity: who(), routes: ["docs"] });
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ accessSignature: accessSignature(who()), agent: "a1", sourceDocumentIds: ["d1"] }));
    await cache.store({ question: "q", embedding: [1], answer: "a", sources: [{ documentId: "d1" }], identity: who(), routes: ["sql"] });
    await cache.store({ question: "q", embedding: [1], answer: "  ", sources: [{ documentId: "d1" }], identity: who(), routes: ["docs"] });
    await cache.store({ question: "q", embedding: [1], answer: "a", sources: [{}], identity: who(), routes: ["docs"] });
    expect(store.insert).toHaveBeenCalledTimes(1);
  });

  it("an approved FAQ answer carries no identity — it is served to every role/agent alike", async () => {
    // FaqMatch has no role/branch/agent field at all; only cache.lookup's *query* is identity-bound
    // (matchCached), never the FAQ shelf itself. This is intentional (see ## Gotcha).
    const faq = { id: "f1", question: "q?", answer: "faq answer", approvedName: "Owner", approvedAt: "2026-09-01" };
    const store = semanticStore({ matchFaq: vi.fn(async () => faq) });
    const cache = createSemanticAnswerCache({ store, embedOne });
    const asStaff = await cache.lookup("q?", who({ role: "staff" }));
    const asOwner = await cache.lookup("q?", who({ role: "owner" }));
    expect(asStaff.hit).toMatchObject({ kind: "faq", answer: "faq answer" });
    expect(asOwner.hit).toMatchObject({ kind: "faq", answer: "faq answer" });
  });
});

describe("createSemanticAnswerCache — a store failure is a miss, not a broken answer", () => {
  it("matchFaq throwing is reported via onError and treated as a miss (falls through to the automatic cache)", async () => {
    const errors: unknown[] = [];
    const store = semanticStore({
      matchFaq: vi.fn(async () => { throw new Error("faq rpc down"); }),
      matchCached: vi.fn(async () => ({ id: "c1", question: "q", answer: "cached", sources: [], createdAt: "t" })),
    });
    const cache = createSemanticAnswerCache({ store, embedOne, onError: e => errors.push(e) });
    const r = await cache.lookup("q", who());
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("faq rpc down");
    expect(r.hit).toMatchObject({ kind: "cache", answer: "cached" });
    // embedOne already ran before either store call, so the embedding always comes back.
    expect(r.embedding).toEqual([0.1, 0.2]);
  });

  it("matchCached throwing is reported via onError and treated as a miss", async () => {
    const errors: unknown[] = [];
    const store = semanticStore({ matchCached: vi.fn(async () => { throw new Error("cache rpc down"); }) });
    const cache = createSemanticAnswerCache({ store, embedOne, onError: e => errors.push(e) });
    const r = await cache.lookup("q", who());
    expect(errors).toHaveLength(1);
    expect(r).toEqual({ hit: null, embedding: [0.1, 0.2] });
  });

  it("bumpFaqHit is fired without awaiting; a synchronous throw and a rejected promise both go to onError", async () => {
    const faq = { id: "f1", question: "q?", answer: "faq answer", approvedName: "Owner", approvedAt: "2026-09-01" };

    const errorsSync: unknown[] = [];
    const syncStore = semanticStore({ matchFaq: vi.fn(async () => faq), bumpFaqHit: vi.fn(() => { throw new Error("sync boom"); }) });
    const syncCache = createSemanticAnswerCache({ store: syncStore, embedOne, onError: e => errorsSync.push(e) });
    const r1 = await syncCache.lookup("q?", who());
    expect(r1.hit).toMatchObject({ kind: "faq" });
    expect(errorsSync).toHaveLength(1);
    expect((errorsSync[0] as Error).message).toBe("sync boom");

    const errorsAsync: unknown[] = [];
    const asyncStore = semanticStore({ matchFaq: vi.fn(async () => faq), bumpFaqHit: vi.fn(async () => { throw new Error("async boom"); }) });
    const asyncCache = createSemanticAnswerCache({ store: asyncStore, embedOne, onError: e => errorsAsync.push(e) });
    await asyncCache.lookup("q?", who());
    await new Promise(resolve => setTimeout(resolve, 0)); // let the rejected promise's .catch settle
    expect(errorsAsync).toHaveLength(1);
    expect((errorsAsync[0] as Error).message).toBe("async boom");
  });
});

describe("createSemanticAnswerCache — a throwing onError is swallowed (safe report)", () => {
  it("never rejects lookup (matchFaq and matchCached both failing) nor store (insert failing)", async () => {
    const onError = throwingOnError();
    const store = semanticStore({
      matchFaq: vi.fn(async () => { throw new Error("faq rpc down"); }),
      matchCached: vi.fn(async () => { throw new Error("cache rpc down"); }),
      insert: vi.fn(async () => { throw new Error("insert down"); }),
    });
    const cache = createSemanticAnswerCache({ store, embedOne, onError });
    await expect(cache.lookup("q", who())).resolves.toEqual({ hit: null, embedding: [0.1, 0.2] });
    await expect(cache.store({
      question: "q", embedding: [0.1, 0.2], answer: "a", sources: [{ documentId: "d1" }], identity: who(), routes: ["docs"],
    })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(3);
  });

  const faq = { id: "f1", question: "q?", answer: "faq answer", approvedName: "Owner", approvedAt: "2026-09-01" };

  it("FAQ hit counter throwing synchronously + throwing onError → lookup still resolves with the FAQ hit", async () => {
    const onError = throwingOnError();
    const store = semanticStore({ matchFaq: vi.fn(async () => faq), bumpFaqHit: vi.fn(() => { throw new Error("sync boom"); }) });
    await expect(createSemanticAnswerCache({ store, embedOne, onError }).lookup("q?", who())).resolves.toMatchObject({ hit: { kind: "faq" } });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("FAQ hit counter rejecting + throwing onError → no unhandled rejection (fire-and-forget stays silent to the process)", async () => {
    const onError = throwingOnError();
    const store = semanticStore({ matchFaq: vi.fn(async () => faq), bumpFaqHit: vi.fn(async () => { throw new Error("async boom"); }) });
    const unhandled = await unhandledDuring(async () => {
      await expect(createSemanticAnswerCache({ store, embedOne, onError }).lookup("q?", who())).resolves.toMatchObject({ hit: { kind: "faq" } });
    });
    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ── Exact strategy: deterministic sha256 key over normalized question + identity ──

const cid = (p: Partial<CacheIdentity> = {}): CacheIdentity => ({ role: "owner", scope: "all", dataDate: "2026-09-07", model: "m/pro", ...p });

describe("cacheKey", () => {
  it("is stable across case, spacing, and trailing punctuation", () => {
    expect(cacheKey("Top 5 items at store A?", cid())).toBe(cacheKey("top 5 items  at store a", cid()));
    expect(cacheKey("x", cid())).toHaveLength(64);
  });

  it("differs by role, scope, data date, and model", () => {
    expect(cacheKey("q", cid({ role: "manager" }))).not.toBe(cacheKey("q", cid({ role: "owner" })));
    expect(cacheKey("q", cid({ role: "manager", scope: "s1" }))).not.toBe(cacheKey("q", cid({ role: "manager", scope: "s2" })));
    expect(cacheKey("q", cid({ dataDate: "2026-09-08" }))).not.toBe(cacheKey("q", cid()));
    expect(cacheKey("q", cid({ model: "m/lite" }))).not.toBe(cacheKey("q", cid({ model: "m/pro" })));
  });

  it("different questions differ", () => {
    expect(cacheKey("revenue yesterday", cid())).not.toBe(cacheKey("revenue today", cid()));
  });
});

describe("normalizeQuestion / isExactCacheable", () => {
  it("normalizes", () => {
    expect(normalizeQuestion("  Why  is X down?! ")).toBe("why is x down");
  });

  it("only validated data answers are cacheable", () => {
    const base = { needs: ["sql"], guardOk: true, clarify: false, smalltalk: false, answer: "x" };
    expect(isExactCacheable(base)).toBe(true);
    expect(isExactCacheable({ ...base, needs: [] })).toBe(false);
    expect(isExactCacheable({ ...base, guardOk: false })).toBe(false);
    expect(isExactCacheable({ ...base, clarify: true })).toBe(false);
    expect(isExactCacheable({ ...base, smalltalk: true })).toBe(false);
    expect(isExactCacheable({ ...base, answer: "  " })).toBe(false);
  });
});

describe("createExactAnswerCache", () => {
  const DB_DEFAULT_CREATED_AT = "2026-09-28T00:00:00.000Z";

  /**
   * In-memory stand-in for the real DB adapter. Mirrors what a Supabase `.upsert(row, {onConflict})`
   * actually does: columns absent from `row` (hits/createdAt — see ExactUpsertRow) are left to the
   * column default on insert, and are simply not part of the SET clause on conflict, so they are
   * never reset back to the default by a re-store.
   */
  function memoryStore(): ExactCacheStore & { rows: Map<string, ExactCacheRow> } {
    const rows = new Map<string, ExactCacheRow>();
    return {
      rows,
      get: async key => rows.get(key) ?? null,
      upsert: async row => {
        const existing = rows.get(row.key);
        rows.set(row.key, {
          ...row,
          hits: row.hits ?? existing?.hits ?? 0,
          createdAt: row.createdAt ?? existing?.createdAt ?? DB_DEFAULT_CREATED_AT,
        });
      },
      bumpHits: async (key, hits) => { const r = rows.get(key); if (r) rows.set(key, { ...r, hits }); },
    };
  }

  it("round-trips an answer under the identity-bound key and counts hits", async () => {
    const store = memoryStore();
    const cache = createExactAnswerCache({ store });
    await cache.store("What is revenue?", cid(), { answer: "42", sources: [], model: "m/pro" });
    const hit = await cache.lookup("what is revenue", cid());
    expect(hit).toMatchObject({ answer: "42", model: "m/pro", hits: 0, createdAt: DB_DEFAULT_CREATED_AT });
    expect(store.rows.get(cacheKey("what is revenue", cid()))?.hits).toBe(1);
  });

  it("another role never sees the cached answer", async () => {
    const store = memoryStore();
    const cache = createExactAnswerCache({ store });
    await cache.store("q", cid({ role: "owner" }), { answer: "salary table", sources: [], model: null });
    expect(await cache.lookup("q", cid({ role: "staff" }))).toBeNull();
  });

  it("re-storing an existing key does not reset hits or createdAt (DB defaults own them; not re-sent on conflict)", async () => {
    const store = memoryStore();
    const cache = createExactAnswerCache({ store });
    const key = cacheKey("q", cid());
    await cache.store("q", cid(), { answer: "a1", sources: [], model: "m/pro" });
    await cache.lookup("q", cid()); // bumps hits to 1
    expect(store.rows.get(key)?.hits).toBe(1);
    const createdAtBefore = store.rows.get(key)?.createdAt;

    await cache.store("q", cid(), { answer: "a2", sources: [], model: "m/pro" }); // re-store, same key
    const row = store.rows.get(key);
    expect(row?.answer).toBe("a2");
    expect(row?.hits).toBe(1); // NOT reset to 0 by the second store()
    expect(row?.createdAt).toBe(createdAtBefore); // NOT overwritten
  });

  it("a failing hit counter never breaks the answer", async () => {
    const store = memoryStore();
    store.bumpHits = async () => { throw new Error("db down"); };
    const cache = createExactAnswerCache({ store });
    await cache.store("q", cid(), { answer: "a", sources: [], model: null });
    await expect(cache.lookup("q", cid())).resolves.toMatchObject({ answer: "a" });
  });

  it("a failing hit counter is reported via onError, not silenced (synchronous throw and rejected promise)", async () => {
    const errorsSync: unknown[] = [];
    const syncStore = memoryStore();
    syncStore.bumpHits = () => { throw new Error("sync boom"); };
    const syncCache = createExactAnswerCache({ store: syncStore, onError: e => errorsSync.push(e) });
    await syncCache.store("q", cid(), { answer: "a", sources: [], model: null });
    await expect(syncCache.lookup("q", cid())).resolves.toMatchObject({ answer: "a" });
    expect(errorsSync).toHaveLength(1);
    expect((errorsSync[0] as Error).message).toBe("sync boom");

    const errorsAsync: unknown[] = [];
    const asyncStore = memoryStore();
    asyncStore.bumpHits = async () => { throw new Error("async boom"); };
    const asyncCache = createExactAnswerCache({ store: asyncStore, onError: e => errorsAsync.push(e) });
    await asyncCache.store("q", cid(), { answer: "a", sources: [], model: null });
    await asyncCache.lookup("q", cid());
    await new Promise(resolve => setTimeout(resolve, 0)); // let the rejected promise's .catch settle
    expect(errorsAsync).toHaveLength(1);
    expect((errorsAsync[0] as Error).message).toBe("async boom");
  });

  it("bumpHits is fired without awaiting; a slow store never delays the answer", async () => {
    const store = memoryStore();
    let bumped = false;
    store.bumpHits = (key, hits) => new Promise<void>(resolve => {
      setTimeout(() => {
        const r = store.rows.get(key);
        if (r) store.rows.set(key, { ...r, hits });
        bumped = true;
        resolve();
      }, 0);
    });
    const cache = createExactAnswerCache({ store });
    await cache.store("q", cid(), { answer: "a", sources: [], model: null });
    const hit = await cache.lookup("q", cid());
    expect(hit).toMatchObject({ answer: "a" });
    expect(bumped).toBe(false); // lookup resolved before the (macrotask-delayed) bump settled
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(bumped).toBe(true);
  });
});

describe("createExactAnswerCache — a store failure is a miss, not a broken answer", () => {
  function memoryStore(): ExactCacheStore & { rows: Map<string, ExactCacheRow> } {
    const rows = new Map<string, ExactCacheRow>();
    return {
      rows,
      get: async key => rows.get(key) ?? null,
      upsert: async row => { rows.set(row.key, { ...row, hits: row.hits ?? 0, createdAt: row.createdAt ?? "t" }); },
      bumpHits: async (key, hits) => { const r = rows.get(key); if (r) rows.set(key, { ...r, hits }); },
    };
  }

  it("store.get throwing is reported via onError and treated as a miss", async () => {
    const errors: unknown[] = [];
    const store = memoryStore();
    store.get = async () => { throw new Error("db down"); };
    const cache = createExactAnswerCache({ store, onError: e => errors.push(e) });
    expect(await cache.lookup("q", cid())).toBeNull();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("db down");
  });
});

describe("createExactAnswerCache — a throwing onError is swallowed (safe report)", () => {
  const row: ExactCacheRow = { key: "k", question: "q", role: "owner", scope: "all", dataDate: "2026-09-07", answer: "a", sources: [], actions: [], model: null, hits: 0, createdAt: "t" };
  const baseStore = (over: Partial<ExactCacheStore> = {}): ExactCacheStore => ({ get: async () => row, upsert: async () => {}, ...over });

  it("never rejects lookup when store.get fails, nor store when upsert fails", async () => {
    const onError = throwingOnError();
    const cache = createExactAnswerCache({
      store: baseStore({ get: async () => { throw new Error("db down"); }, upsert: async () => { throw new Error("upsert down"); } }),
      onError,
    });
    await expect(cache.lookup("q", cid())).resolves.toBeNull();
    await expect(cache.store("q", cid(), { answer: "a", sources: [], model: null })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("hit counter throwing synchronously + throwing onError → lookup still resolves with the hit", async () => {
    const onError = throwingOnError();
    const cache = createExactAnswerCache({ store: baseStore({ bumpHits: () => { throw new Error("sync boom"); } }), onError });
    await expect(cache.lookup("q", cid())).resolves.toMatchObject({ answer: "a" });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("hit counter rejecting + throwing onError → no unhandled rejection (fire-and-forget stays silent to the process)", async () => {
    const onError = throwingOnError();
    const cache = createExactAnswerCache({ store: baseStore({ bumpHits: async () => { throw new Error("async boom"); } }), onError });
    const unhandled = await unhandledDuring(async () => {
      await expect(cache.lookup("q", cid())).resolves.toMatchObject({ answer: "a" });
    });
    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("createExactAnswerCache — purge", () => {
  function memoryStore(): ExactCacheStore & { rows: Map<string, ExactCacheRow> } {
    const rows = new Map<string, ExactCacheRow>();
    return {
      rows,
      get: async key => rows.get(key) ?? null,
      upsert: async row => { rows.set(row.key, { ...row, hits: row.hits ?? 0, createdAt: row.createdAt ?? "t" }); },
      bumpHits: async (key, hits) => { const r = rows.get(key); if (r) rows.set(key, { ...r, hits }); },
    };
  }

  it("delegates to the store's purge, for seed/ML-run scripts", async () => {
    const store = memoryStore();
    store.purge = vi.fn(async () => 3);
    const cache = createExactAnswerCache({ store });
    expect(await cache.purge()).toBe(3);
    expect(store.purge).toHaveBeenCalledTimes(1);
  });

  it("resolves 0 when the store does not implement purge", async () => {
    const cache = createExactAnswerCache({ store: memoryStore() });
    expect(await cache.purge()).toBe(0);
  });
});
