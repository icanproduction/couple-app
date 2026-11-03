# llm-provider

Lapisan LLM untuk app Next.js + Supabase: provider OpenAI-compatible yang malas (router / synthesis / narrator / per-agent / tier yang bisa diganti owner tanpa deploy) dengan **strict structured output** menyala, knob reasoning effort, katalog model (kemampuan + modality + harga), embeddings batch + retry + cek dimensi, taksiran biaya sesi, saldo akun, dan **answer cache** dua strategi (semantik dan exact) yang kuncinya selalu memuat identitas akses supaya cache tidak jadi pintu kebocoran.

## Kontrak

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  resolveModelIds, createLlmProvider, providerOptionsFor, ROUTER_OPTIONS, SQL_OPTIONS,
  fetchModelCatalog, capabilitiesFromParams, toModelInfo, visionModels, pdfNative, findModel,
  createEmbedder, toPgVector,
  costOfUsage, contextLimitOf, DEFAULT_PRICES, FALLBACK_PRICE, fetchCredits,
  createSemanticAnswerCache, accessSignature, isRouteCacheable,
  createExactAnswerCache, cacheKey, normalizeQuestion, isExactCacheable,
} from "./llm-provider";

resolveModelIds(env, defaults?)                       // → { router, synthesis, narrator }
createLlmProvider(cfg: { baseUrl, apiKey, models }, { createOpenAICompatible })
  // → { router(), synthesis(), narrator(), byId(id?), tier(tiers, key) }
providerOptionsFor(effort?)                            // → { llm: { reasoningEffort } } | undefined
fetchModelCatalog({ baseUrl, fetchImpl? })             // → ModelInfo[] ([] saat gagal)
createEmbedder({ baseUrl, apiKey, model, dim? }, { batchSize?, retries?, fetchImpl?, sleep?, onUsage? })
  // → { embed(texts), embedOne(text) } — batchSize wajib bilangan bulat > 0 (0/negatif/NaN/pecahan → throw saat konstruksi)
costOfUsage(rows, prices?, fallback?)                  // → { tokensIn, tokensOut, usd }
fetchCredits({ baseUrl, apiKey, fetchImpl? })          // → { totalCredits, totalUsage } | null
createSemanticAnswerCache({ store: SemanticCacheStore, embedOne, faqMinSimilarity?, cacheMinSimilarity?, cacheableRoutes?, onError? })
  // → { lookup(question, identity), store({ question, embedding, answer, sources, identity, routes }) }
createExactAnswerCache({ store: ExactCacheStore, onError? })
  // → { lookup(question, cacheIdentity), store(question, cacheIdentity, payload), purge() }
```

Seam dependency-injection: factory `createOpenAICompatible`, `fetchImpl`, `sleep`, adapter DB (`SemanticCacheStore`, `ExactCacheStore`), dan logger `onError`. Modul tidak membaca `process.env`.

**Exact cache — kontrak gating:** `createExactAnswerCache().store()` TIDAK menyaring sendiri; caller WAJIB menyaring dengan `isExactCacheable(pipelineState)` sebelum memanggil `store()` (bukan tugas cache, karena inputnya — `needs`/`guardOk`/`clarify`/`smalltalk` — adalah state pipeline yang cache-nya sendiri tidak lihat). Bandingkan dengan strategi semantik, yang gating-nya (`isRouteCacheable`) sudah built-in di dalam `store()` sendiri karena `routes` memang bagian dari payload yang dikirim. Contoh di **Cara adopt**.

**Strict output:** provider dibuat dengan `supportsStructuredOutputs: true`, jadi `generateObject({ model: llm.router(), schema })` dari paket `ai` mengirim `response_format: json_schema` (strict), bukan `json_object` bebas. Pakai `ROUTER_OPTIONS` (reasoning mati) untuk keputusan kecil ber-skema, `SQL_OPTIONS` (effort low) untuk text-to-SQL. Jaminan format wire ini datang dari `@ai-sdk/openai-compatible` sendiri — ketiga app sumber memakai `supportsStructuredOutputs: true` yang sama di `src/lib/llm/provider.ts` (lihat `## Asal`), tapi itu pemakaian di produksi, bukan verifikasi oleh test — dan bukan dari test di modul ini, yang sengaja tidak menambah dependency `ai` hanya untuk membuktikannya (lihat `## Gotcha`).

`ROUTER_OPTIONS.llm.reasoningEffort` bertipe `WireEffort` (`Effort | "none"`), bukan `Effort` — `providerOptionsFor(effort?: Effort)` tetap hanya menerima tiga level asli; `"none"` cuma nilai wire internal untuk mematikan reasoning di panggilan router.

## Cara adopt

1. Salin folder `llm-provider/` ke `src/lib/llm-provider/` app.
2. `npm i @ai-sdk/openai-compatible ai zod`.
3. Buat satu file wiring di app (satu-satunya tempat env dibaca):

```ts
// src/lib/llm.ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLlmProvider, resolveModelIds, createEmbedder } from "./llm-provider";

export const llm = createLlmProvider(
  { baseUrl: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1", apiKey: process.env.LLM_API_KEY ?? "", models: resolveModelIds(process.env) },
  { createOpenAICompatible },
);
export const embedder = createEmbedder({
  baseUrl: process.env.EMBEDDINGS_BASE_URL ?? "https://openrouter.ai/api/v1",
  apiKey: process.env.EMBEDDINGS_API_KEY || process.env.LLM_API_KEY || "",
  model: process.env.EMBEDDINGS_MODEL ?? "baai/bge-m3",
  dim: 1024,
});
```

4. Cache katalog/saldo di Next: kirim `fetchImpl: (u, i) => fetch(u, { ...i, next: { revalidate: 3600 } })`.
5. **Client/edge boundary:** `answer-cache.ts` mengimpor `node:crypto` (untuk `cacheKey` sha256). Barrel `index.ts` me-re-export semuanya termasuk `answer-cache.ts`, jadi mengimpor lewat `"./llm-provider"` (index) di komponen klien Next atau di edge runtime akan menarik `node:crypto` ke bundle itu dan gagal build/runtime. Import `pricing.ts` dan `catalog.ts` **langsung dari file-nya** (`./llm-provider/pricing`, `./llm-provider/catalog`) di komponen klien, jangan lewat index. Hash output sha256 tidak diubah untuk menghindari ini — lihat `## Varian`.
6. Answer cache: tulis adapter kecil di app. Semantik (Supabase RPC):

```ts
const store: SemanticCacheStore = {
  matchFaq: async (e, min) => (await db.rpc("match_faq", { query_embedding: JSON.stringify(e), min_similarity: min })).data?.[0] ?? null,
  matchCached: async (e, sig, agent, min) => (await db.rpc("match_cached_answer", { query_embedding: JSON.stringify(e), sig, agent_slug: agent, min_similarity: min })).data?.[0] ?? null,
  insert: async r => { await db.from("answer_cache").insert({ question: r.question, embedding: JSON.stringify(r.embedding), answer: r.answer, sources: r.sources, access_signature: r.accessSignature, agent: r.agent, source_document_ids: r.sourceDocumentIds }); },
};
export const semanticCache = createSemanticAnswerCache({ store, embedOne: embedder.embedOne, onError: e => console.error("[cache]", e) });
```

   Selalu sambungkan `onError` (logger app, mis. `e => console.error("[cache]", e)`): tanpa itu, store yang down tetap jadi miss dan penghitung hit yang gagal tetap tidak menggagalkan jawaban, tapi keduanya bisu total. Logger yang melempar ditelan modul — tidak membuat `lookup`/`store` reject dan tidak jadi unhandled rejection.

   Exact: `get` = `select … eq("key", key).maybeSingle()`, `upsert` = `upsert(row, { onConflict: "key" })`, `bumpHits` = `update({ hits })`, lalu `createExactAnswerCache({ store: exactStore, onError: e => console.error("[cache]", e) })`. Petakan snake_case kolom ke field camelCase di adapter. `row` yang dikirim modul TIDAK memuat `hits`/`created_at` (lihat `## Struktur data`) — pastikan kolom itu punya `DEFAULT` di migrasi supaya insert pertama tetap terisi.

   Gating: pipeline (bukan cache) yang tahu apakah jawaban layak disimpan exact. Panggil `isExactCacheable` sebelum `store()`:

```ts
if (isExactCacheable({ needs, guardOk, clarify, smalltalk, answer })) {
  await exactCache.store(question, cacheIdentity, { answer, sources, model, actions });
}
```

## Struktur data

- Tanpa tabel wajib untuk provider, katalog, embeddings, pricing, credits.
- Answer cache **semantik** mengasumsikan: tabel `answer_cache` (question, embedding vector, answer, sources jsonb, access_signature, agent, source_document_ids uuid[]), tabel FAQ tersetujui (question, answer, embedding, approved_name, approved_at, hit_count), dua RPC similarity (`match_faq`, `match_cached_answer`), dan policy RLS `access_signature like (auth_role() || ':%')`. Invalidasi: hapus baris yang `source_document_ids` memuat dokumen yang berubah.
- Answer cache **exact** mengasumsikan: `answer_cache` (key text PK, question, role, scope, data_date, answer, sources jsonb, actions jsonb, model, created_at, hits) + policy RLS yang menghitung scope dengan fungsi yang sama dengan app. **`hits` dan `created_at` memakai DEFAULT kolom DB** (mis. `hits int default 0`, `created_at timestamptz default now()`) — modul sengaja TIDAK mengirim kedua field itu ke `upsert()` (`ExactUpsertRow` menandainya opsional), supaya insert pertama terisi oleh default DB, dan re-store pada key yang sama (`ON CONFLICT (key)`) tidak menimpanya balik ke `0`/waktu sekarang karena kolomnya memang tidak ikut di SET clause. Adapter Supabase asli sudah berperilaku begini (`.upsert(row, {...})` hanya menyentuh kolom yang ada di `row`); adapter lain harus meniru pola ini secara eksplisit.
- Skema lengkap dua varian ini TIDAK diekstrak jadi `schema.sql`: inspeksi migrasi tiga app memutuskan `supabase-core` turun ke tier 2 (lihat "Keputusan tier" di `README.md` library). Sisi database-nya — identitas akses di kunci, RLS sebagai lapis kedua, invalidasi — ada di `patterns/answer-cache-rls.md`, lengkap dengan path migrasi sumber. Jangan menulis migrasi dari ingatan.

## Varian

- **Embeddings:** app pertama batch 32 tanpa cek dimensi dan env dibaca langsung; app ketiga batch 64 + cek jumlah vektor + cek dimensi 1024 + `onUsage` untuk estimasi biaya (dipakai sebagai basis). App kedua 15 baris (pembungkus tipis). Di modul: batch default 64, `dim` opsional (tidak diisi = tanpa cek), `sleep` disuntik.
- **Provider:** app pertama punya `tier()` dari tabel model tiers (owner ganti model tanpa deploy); app kedua menambah `ROUTER_OPTIONS`/`SQL_OPTIONS` (terukur di produksi); app ketiga membuat client malas dan menambah peran `narrator`. Modul menggabungkan ketiganya.
- **Katalog:** app ketiga memakai `models.ts` (id per peran dari env) sementara dua app lain memakai `catalog.ts` (katalog OpenRouter). Di modul keduanya ada: `resolveModelIds` di `provider.ts`, katalog di `catalog.ts`.
- **Answer cache:** dua strategi yang benar-benar berbeda, bukan satu versi yang bercabang. Semantik (app pertama): embedding + FAQ tersetujui dulu (≥0,9) lalu cache otomatis (≥0,95) + sidik akses role:cabang:agent:rak; hanya jalur `docs` yang disimpan. Exact (app ketiga): sha256 atas pertanyaan dinormalkan + role + scope + tanggal data + model; hanya jawaban data tervalidasi yang disimpan. Fungsi `cacheScope` app ketiga (outlet → brand → area → group) sengaja tidak ikut karena domain-spesifik; tiru polanya: scope di kode HARUS sama dengan fungsi scope di policy RLS.
- **Pricing:** identik di dua app. Tabel harga ikut sebagai `DEFAULT_PRICES` (snapshot 14 Agu + 2 Sep 2026), tapi bisa diganti per app.
- **TTL yang sengaja tidak dibuat:** rencana awal modul ini menyebut `ttlDays` sebagai opsi `createAnswerCache`/`createExactAnswerCache`. Tidak diimplementasikan — tidak satu pun dari dua app sumber punya TTL berbasis waktu untuk cache jawabannya. Freshness datang dari cara lain: strategi exact memakai `dataDate` sebagai bagian kunci (tanggal data baru = kunci baru, otomatis tidak pernah menyajikan angka basi), dan strategi semantik bergantung pada invalidasi berbasis `source_document_ids` (baris dihapus saat dokumen sumbernya berubah). `purge()` (delegasi ke `ExactCacheStore.purge`, opsional) disediakan untuk skrip seed/ML-run yang perlu membuang baris lama secara manual — bukan pengganti TTL otomatis.
- **`node:crypto` di `answer-cache.ts`:** dipertahankan (bukan diganti ke Web Crypto async) supaya output hash `cacheKey` — sha256 hex — identik dengan dua app sumber. Konsekuensinya didokumentasikan sebagai batas import di `## Cara adopt`, bukan diselesaikan dengan mengubah algoritma hash.

## Gotcha

- Nama provider `"llm"` adalah kunci `providerOptions`. Ganti nama di satu tempat saja = effort diam-diam tidak terkirim.
- Jangan pin alias `~…-latest` (isinya berganti diam-diam) dan jangan pakai model `:free` di produksi; katalog sudah membuangnya.
- Tanpa effort, jangan kirim field `reasoning_effort` sama sekali: model non-reasoning menolaknya.
- Reasoning di panggilan router boros tanpa manfaat: terukur 2,5 dtk → 1,7 dtk setelah dimatikan, keputusan sama.
- Retry hanya untuk jaringan/429/5xx. 400 berarti request salah; mengulanginya hanya membakar kuota. Error bentuk-respons yang deterministik (`expected N vectors`, `expected dimension`) juga TIDAK di-retry (status 422 internal) — kalau upstream mengirim jumlah/dimensi vektor yang salah, mengulang permintaan yang sama tidak akan mengubah bentuk responsnya, jadi retry hanya menunda kegagalan sambil membakar kuota.
- Cek dimensi embedding menangkap model yang tertukar (768 vs 1024) sebelum vektor rusak masuk pgvector.
- Cache: kunci tanpa identitas akses = kebocoran data lintas role tanpa error. Jangan cache jawaban dari jalur SQL/graph (angka dan relasi berubah); jangan cache jawaban tanpa dokumen sumber (tidak bisa diinvalidasi).
- **Jawaban FAQ tersetujui tidak membawa identitas sama sekali** — begitu masuk shelf FAQ (`matchFaq`), jawabannya disajikan ke SEMUA role/agent yang bertanya kemiripan yang sama, tanpa cek `access_signature`. Ini beda dari strategi cache otomatis (`matchCached`), yang memang identity-bound. Hanya taruh pertanyaan di shelf FAQ kalau jawabannya betul-betul aman dibaca siapa saja.
- Kegagalan store pada lookup (`matchFaq`/`matchCached` di strategi semantik, `store.get` di strategi exact) ditangkap dan diperlakukan sebagai MISS, dilaporkan lewat `onError` — cache yang error tidak boleh menjelma jadi jawaban yang rusak. Pengecualian yang disengaja: **`embedOne` yang gagal di lookup semantik TETAP throw** (tidak ditangkap) — embedding dibutuhkan sebelum apa pun bisa dicari, jadi kegagalannya diteruskan mentah ke caller, yang lebih tahu apakah harus fallback ke pipeline penuh atau gagal total.
- Menghitung hit cache (exact `bumpHits`, semantik `bumpFaqHit`) tidak boleh bisa menggagalkan jawaban DAN tidak boleh menambah round-trip DB ke latensi jawaban — keduanya dilepas tanpa `await`; kegagalannya (throw sinkron atau promise reject) dilaporkan lewat `onError`, tidak didiamkan bisu.
- Setiap pemanggilan `onError` di answer cache lewat pembungkus `safeReport` (try/catch): `onError` yang melempar tidak pernah membuat `lookup`/`store` reject, dan di penghitung hit yang dilepas tanpa `await` tidak pernah berubah jadi unhandled rejection yang bisa menjatuhkan proses Node.
- Exact `store()` tidak menyaring sendiri (lihat `## Kontrak`) — lupa memanggil `isExactCacheable` di caller berarti segala jawaban (termasuk smalltalk/clarify/abstain) bisa ke-cache.
- Klaim strict output (`response_format: json_schema`) hanya diverifikasi lewat objek settings yang dikirim ke `createOpenAICompatible` (test provider.test.ts). Modul ini sengaja TIDAK menambah dependency `ai` untuk membuktikan bentuk wire request yang sesungguhnya — itu tanggung jawab `@ai-sdk/openai-compatible` sendiri. Ketiga app sumber memakai `supportsStructuredOutputs: true` yang sama (lihat `## Asal`); itu bukti pemakaian, bukan verifikasi wire oleh test mana pun di library ini.
- Cache narasi/ringkasan harus membawa versi engine; lihat modul `daily-brief`.

## Asal

| App | Path | Commit | Tanggal |
|---|---|---|---|
| altus-app | `src/lib/llm/{provider,catalog,embeddings}.ts`, `src/lib/{pricing,openrouter,answer-cache}.ts`, tests `src/lib/__tests__/{provider,catalog,embeddings,pricing,answer-cache}.test.ts` | `fb85338` | 2026-09-17 |
| altus-bi | `src/lib/llm/{provider,catalog,embeddings}.ts`, `src/lib/{pricing,openrouter}.ts` | `ebf3106` | 2026-09-18 |
| artisan-intelligence | `src/lib/llm/{provider,models,embeddings}.ts`, `src/lib/maitre/answer-cache.ts`, tests `src/lib/__tests__/{embeddings,llm-models,maitre-answer-cache}.test.ts` | `c7d0308` | 2026-09-08 |

Snapshot ke library: 2026-09-28. Test di library: 79 lulus (`npx vitest run modules/llm-provider`).
