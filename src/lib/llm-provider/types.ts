// Kontrak llm-provider. Semua dependency masuk lewat parameter; modul tidak membaca
// process.env, tidak mengimpor @/..., dan tidak menyebut nama tabel.

export type Effort = "low" | "medium" | "high";

/**
 * Nilai mentah yang benar-benar dikirim di wire untuk `reasoning_effort`. Superset dari `Effort`:
 * `"none"` valid di body request (mematikan reasoning) tapi bukan pilihan yang app boleh minta lewat
 * `providerOptionsFor` (yang hanya menerima `Effort`) — `ROUTER_OPTIONS` memakainya secara internal.
 */
export type WireEffort = Effort | "none";

/** Model id per peran. narrator default = synthesis. */
export type ModelIds = { router: string; synthesis: string; narrator: string };

export type LlmConfig = {
  /** OpenAI-compatible base URL, mis. https://openrouter.ai/api/v1 (trailing slash dipangkas). */
  baseUrl: string;
  apiKey: string;
  models: ModelIds;
};

/** Settings yang dikirim ke createOpenAICompatible. */
export type CompatSettings = { name: string; baseURL: string; apiKey: string; supportsStructuredOutputs: boolean };
/** Bentuk minimal createOpenAICompatible: settings → (modelId) → model. */
export type CompatFactory<M> = (settings: CompatSettings) => (modelId: string) => M;

/** Baris tier yang bisa diganti owner tanpa deploy (tabel model tiers milik app). */
export type TierRow = { tier: string; model_id: string };

export type ModelCaps = { tools: boolean; reasoning: boolean; effort: boolean; structured: boolean };

export type ModelInfo = {
  id: string;
  name: string;
  ctx: number;
  /** USD per juta token input. */
  inPerM: number;
  /** USD per juta token output. */
  outPerM: number;
  caps: ModelCaps;
  inputs: string[];
};

/** Satu entri mentah dari GET {base}/models (format OpenRouter). */
export type RawModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[] };
};

export type EmbedConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Kalau diisi, setiap vektor wajib berdimensi ini (mis. bge-m3 = 1024). */
  dim?: number;
};

export type EmbedUsage = { promptTokens: number; totalTokens: number };

export type EmbedOptions = {
  batchSize?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  /** Disuntik supaya test retry tidak benar-benar menunggu. */
  sleep?: (ms: number) => Promise<void>;
  onUsage?: (u: EmbedUsage) => void;
};

export type Price = { inPerM: number; outPerM: number };
export type UsageRow = { model: string; tokensIn: number | null; tokensOut: number | null };

// ── Answer cache: strategi semantik (vektor + sidik akses) ────────────────────

export type AccessIdentity = {
  role: string;
  branchId: string | null;
  agent: string;
  /** Rak/domain agent; ikut menentukan apa yang bisa terambil. */
  domains: string[] | null;
};

/** Sumber sitasi minimal yang dibutuhkan cache: documentId untuk invalidasi. */
export type CacheSource = { documentId?: string | null } & Record<string, unknown>;

export type FaqMatch = { id: string; question: string; answer: string; approvedName: string | null; approvedAt: string | null };
export type CachedMatch = { id: string; question: string; answer: string; sources: CacheSource[]; createdAt: string | null };

export type SemanticCacheRow = {
  question: string;
  embedding: number[];
  answer: string;
  sources: CacheSource[];
  accessSignature: string;
  agent: string;
  sourceDocumentIds: string[];
};

/** Adapter DB milik app (mis. RPC match_faq / match_cached_answer + insert). */
export interface SemanticCacheStore {
  matchFaq(embedding: number[], minSimilarity: number): Promise<FaqMatch | null>;
  bumpFaqHit?(id: string): Promise<void>;
  matchCached(embedding: number[], signature: string, agent: string, minSimilarity: number): Promise<CachedMatch | null>;
  insert(row: SemanticCacheRow): Promise<void>;
}

export type SemanticHit = {
  kind: "faq" | "cache";
  answer: string;
  sources: CacheSource[];
  question: string;
  approvedName?: string | null;
  approvedAt?: string | null;
  createdAt?: string | null;
};

// ── Answer cache: strategi exact (kunci sha256 deterministik) ─────────────────

export type CacheIdentity = { role: string; scope: string; dataDate: string; model: string };

export type ExactCacheRow = {
  key: string;
  question: string;
  role: string;
  scope: string;
  dataDate: string;
  answer: string;
  sources: CacheSource[];
  actions: unknown[];
  model: string | null;
  createdAt: string;
  hits: number;
};

/**
 * Baris yang dikirim ke `upsert`. `hits` dan `createdAt` opsional dengan sengaja: modul tidak
 * pernah mengisinya, supaya kolom DB (default `0` / `now()`) yang menentukan nilai saat insert,
 * dan supaya keduanya TIDAK ikut tertimpa balik ke nilai awal setiap kali baris yang sama di-upsert
 * ulang (re-store setelah cache hit sebelumnya). Lihat `## Struktur data` di MODULE.md.
 */
export type ExactUpsertRow = Omit<ExactCacheRow, "hits" | "createdAt"> & Partial<Pick<ExactCacheRow, "hits" | "createdAt">>;

export interface ExactCacheStore {
  get(key: string): Promise<ExactCacheRow | null>;
  upsert(row: ExactUpsertRow): Promise<void>;
  bumpHits?(key: string, hits: number): Promise<void>;
  /** Opsional: hapus baris lama/kedaluwarsa untuk skrip seed atau ML run. Modul tidak menjadwalkannya sendiri. */
  purge?(): Promise<number>;
}

export type ExactHit = { answer: string; sources: CacheSource[]; actions: unknown[]; model: string | null; createdAt: string; hits: number };
