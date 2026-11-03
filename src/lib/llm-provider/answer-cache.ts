import { createHash } from "node:crypto";
import type {
  AccessIdentity,
  CachedMatch,
  CacheIdentity,
  CacheSource,
  ExactCacheRow,
  ExactCacheStore,
  ExactHit,
  FaqMatch,
  SemanticCacheStore,
  SemanticHit,
} from "./types";

// Cache jawaban. Bahaya nomor satu bukan jawaban basi, melainkan KEBOCORAN: kalau kunci cache
// hanya teks pertanyaan, staf yang mengetik pertanyaan persis sama dengan owner menerima jawaban
// owner, dan cache jadi pintu belakang yang melewati RLS tanpa satu pun error. Maka identitas
// akses selalu jadi bagian kunci, di kedua strategi, dan RLS app menegakkannya sebagai lapis kedua.

/**
 * Bungkus `onError` milik app: logger yang melempar tidak boleh membuat `lookup`/`store` reject,
 * dan — di penghitung hit yang dilepas tanpa `await` — tidak boleh berubah jadi unhandled
 * rejection yang menjatuhkan proses. Semua pelaporan di file ini lewat sini.
 */
function safeReport(onError: ((e: unknown) => void) | undefined): (e: unknown) => void {
  return e => {
    try { onError?.(e); } catch { /* logger sendiri gagal — bukan urusan cache */ }
  };
}

// ── Strategi semantik: kemiripan vektor, FAQ tersetujui dulu, sidik akses di kunci ──

/**
 * Sidik akses. HARUS diawali role: policy RLS memakai `access_signature like (auth_role() || ':%')`.
 * Rak diurutkan supaya urutan checkbox di UI tidak diam-diam membuat cache meleset.
 */
export function accessSignature(id: AccessIdentity): string {
  const shelf = id.domains && id.domains.length ? [...id.domains].sort().join("+") : "*";
  return `${id.role}:${id.branchId ?? "-"}:${id.agent}:${shelf}`;
}

/** Hanya jalur yang jawabannya stabil yang boleh disimpan. Default: murni dokumen (angka SQL berubah tiap hari). */
export function isRouteCacheable(routes: string[], allow: string[] = ["docs"]): boolean {
  return routes.length > 0 && routes.every(r => allow.includes(r));
}

export function createSemanticAnswerCache(deps: {
  store: SemanticCacheStore;
  embedOne: (text: string) => Promise<number[]>;
  faqMinSimilarity?: number;
  cacheMinSimilarity?: number;
  cacheableRoutes?: string[];
  onError?: (e: unknown) => void;
}) {
  const faqMin = deps.faqMinSimilarity ?? 0.9;
  const cacheMin = deps.cacheMinSimilarity ?? 0.95;
  const report = safeReport(deps.onError);

  /**
   * Urutan: FAQ tersetujui → cache otomatis → (miss) pipeline penuh. Embedding dikembalikan untuk
   * store. `embedOne` yang gagal TIDAK ditangkap di sini: itu tanggung jawab caller (lihat ## Gotcha).
   * Kegagalan store (`matchFaq`/`matchCached`) HARUS jadi miss, bukan jawaban yang rusak — dilaporkan
   * lewat `onError` lalu lanjut ke strategi berikutnya, karena satu RPC yang down tidak boleh
   * menjatuhkan seluruh lookup.
   */
  async function lookup(question: string, id: AccessIdentity): Promise<{ hit: SemanticHit | null; embedding: number[] }> {
    const embedding = await deps.embedOne(question);

    let faq: FaqMatch | null = null;
    try {
      faq = await deps.store.matchFaq(embedding, faqMin);
    } catch (e) {
      report(e);
    }
    if (faq) {
      // Dilepas tanpa menunggu: menghitung hit tidak boleh menambah latensi jawaban. Baik throw
      // sinkron maupun promise yang reject dilaporkan lewat onError, bukan didiamkan — dan lewat
      // `report`, supaya onError yang melempar tidak jadi unhandled rejection.
      try {
        void deps.store.bumpFaqHit?.(faq.id)?.catch(report);
      } catch (e) {
        report(e);
      }
      return {
        hit: { kind: "faq", answer: faq.answer, sources: [], question: faq.question, approvedName: faq.approvedName, approvedAt: faq.approvedAt },
        embedding,
      };
    }

    let cached: CachedMatch | null = null;
    try {
      cached = await deps.store.matchCached(embedding, accessSignature(id), id.agent, cacheMin);
    } catch (e) {
      report(e);
    }
    if (cached) {
      return {
        hit: { kind: "cache", answer: cached.answer, sources: cached.sources ?? [], question: cached.question, createdAt: cached.createdAt },
        embedding,
      };
    }
    return { hit: null, embedding };
  }

  async function store(input: {
    question: string;
    embedding: number[];
    answer: string;
    sources: CacheSource[];
    identity: AccessIdentity;
    routes: string[];
  }): Promise<void> {
    if (!isRouteCacheable(input.routes, deps.cacheableRoutes) || !input.answer.trim()) return;
    const sourceDocumentIds = [...new Set(input.sources.map(s => s.documentId).filter((d): d is string => !!d))];
    // Tanpa dokumen sumber tidak ada yang bisa memicu invalidasi, jadi jangan disimpan.
    if (sourceDocumentIds.length === 0) return;
    try {
      await deps.store.insert({
        question: input.question,
        embedding: input.embedding,
        answer: input.answer,
        sources: input.sources,
        accessSignature: accessSignature(input.identity),
        agent: input.identity.agent,
        sourceDocumentIds,
      });
    } catch (e) {
      report(e);
    }
  }

  return { lookup, store };
}

// ── Strategi exact: kunci sha256 atas pertanyaan dinormalkan + identitas ──

/** Huruf kecil, spasi rapat, tanpa tanda baca ujung. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[\s?!.。]+$/g, "").trim();
}

/**
 * role + scope = penjaga kebocoran; dataDate = hari data baru → kunci baru (angka tidak basi);
 * model = ganti tier tidak menyajikan jawaban model lama. `scope` HARUS dihitung sama persis
 * dengan fungsi scope di policy RLS app.
 */
export function cacheKey(question: string, id: CacheIdentity): string {
  return createHash("sha256").update([normalizeQuestion(question), id.role, id.scope, id.dataDate, id.model].join("|")).digest("hex");
}

/** Yang boleh disimpan: jawaban tervalidasi dari jalur data. Smalltalk/clarify/abstain tidak. */
export function isExactCacheable(s: { needs: string[]; guardOk: boolean; clarify: boolean; smalltalk: boolean; answer: string }): boolean {
  return s.needs.length > 0 && s.guardOk && !s.clarify && !s.smalltalk && s.answer.trim().length > 0;
}

export function createExactAnswerCache(deps: { store: ExactCacheStore; onError?: (e: unknown) => void }) {
  const report = safeReport(deps.onError);
  /**
   * Cache read yang gagal harus jadi miss, bukan jawaban yang rusak: `store.get` dibungkus, dan
   * kegagalannya dilaporkan lewat `onError` lalu diperlakukan seperti tidak ada baris sama sekali.
   */
  async function lookup(question: string, id: CacheIdentity): Promise<ExactHit | null> {
    const key = cacheKey(question, id);
    let row: ExactCacheRow | null;
    try {
      row = await deps.store.get(key);
    } catch (e) {
      report(e);
      return null;
    }
    if (!row) return null;
    // Hitung hit tanpa menunggu: tidak boleh menambah round-trip DB ke latensi jawaban. Baik throw
    // sinkron (adapter yang salah tulis) maupun promise yang reject dilaporkan lewat onError —
    // menghitung hit tidak boleh bisa menggagalkan jawaban, tapi juga tidak boleh didiamkan bisu.
    try {
      void deps.store.bumpHits?.(key, (row.hits ?? 0) + 1)?.catch(report);
    } catch (e) {
      report(e);
    }
    return { answer: row.answer, sources: row.sources ?? [], actions: Array.isArray(row.actions) ? row.actions : [], model: row.model, createdAt: row.createdAt, hits: row.hits };
  }

  /**
   * Caller HARUS menyaring dengan `isExactCacheable` sebelum memanggil ini (lihat ## Kontrak) —
   * cache ini tidak melihat state pipeline (needs/guardOk/clarify/smalltalk), jadi tidak bisa
   * menyaring sendiri. `hits`/`createdAt` sengaja TIDAK dikirim: biar kolom DB yang mendefaultkannya
   * saat insert, dan supaya re-store pada key yang sama tidak menimpanya balik ke 0/sekarang.
   */
  async function store(
    question: string,
    id: CacheIdentity,
    payload: { answer: string; sources: CacheSource[]; model: string | null; actions?: unknown[] },
  ): Promise<void> {
    try {
      await deps.store.upsert({
        key: cacheKey(question, id),
        question,
        role: id.role,
        scope: id.scope,
        dataDate: id.dataDate,
        answer: payload.answer,
        sources: payload.sources,
        actions: payload.actions ?? [],
        model: payload.model,
      });
    } catch (e) {
      report(e);
    }
  }

  /** Delegasi ke store; dipakai skrip seed/ML-run untuk membuang baris lama. 0 kalau adapter tidak mengimplementasikannya. */
  async function purge(): Promise<number> {
    return (await deps.store.purge?.()) ?? 0;
  }

  return { lookup, store, purge };
}
