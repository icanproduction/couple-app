import type { CompatFactory, Effort, LlmConfig, ModelIds, TierRow, WireEffort } from "./types";

// Satu-satunya tempat vendor LLM disebut. Ganti provider = ganti config, bukan kode.
// Nama provider "llm" adalah kunci providerOptions di bawah; jangan diganti sebelah saja.
export const PROVIDER_NAME = "llm";

export const DEFAULT_ROUTER = "deepseek/deepseek-v4-flash";
export const DEFAULT_SYNTHESIS = "deepseek/deepseek-v3.2";

const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

/**
 * Baca id model dari record ala env (LLM_MODEL_ROUTER / _SYNTHESIS / _NARRATOR).
 * Prioritas narrator: env LLM_MODEL_NARRATOR → defaults.narrator → synthesis yang sudah diresolve.
 */
export function resolveModelIds(env: Record<string, string | undefined>, defaults: Partial<ModelIds> = {}): ModelIds {
  const synthesis = pick(env.LLM_MODEL_SYNTHESIS, defaults.synthesis ?? DEFAULT_SYNTHESIS);
  return {
    router: pick(env.LLM_MODEL_ROUTER, defaults.router ?? DEFAULT_ROUTER),
    synthesis,
    narrator: pick(env.LLM_MODEL_NARRATOR, defaults.narrator ?? synthesis),
  };
}

/**
 * Provider OpenAI-compatible yang malas: client baru dibuat pada panggilan model pertama,
 * jadi impor/konstruksi tidak melempar saat config kosong (test, build).
 * supportsStructuredOutputs: true → generateObject mengirim response_format json_schema (strict),
 * bukan json_object bebas. Ini jalur "strict output" untuk semua keputusan ber-skema.
 */
export function createLlmProvider<M>(cfg: LlmConfig, deps: { createOpenAICompatible: CompatFactory<M> }) {
  let client: ((modelId: string) => M) | null = null;
  const compat = (modelId: string): M => {
    client ??= deps.createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL: cfg.baseUrl.replace(/\/$/, ""),
      apiKey: cfg.apiKey,
      supportsStructuredOutputs: true,
    });
    return client(modelId);
  };

  const provider = {
    router: () => compat(cfg.models.router),
    synthesis: () => compat(cfg.models.synthesis),
    narrator: () => compat(cfg.models.narrator),
    /** Model per agent/tier. Kosong = synthesis. */
    byId: (id?: string | null) => compat(id?.trim() || cfg.models.synthesis),
    /**
     * Tier yang bisa diganti owner tanpa deploy. Baris tidak ada (mis. preview branch dengan
     * tabel kosong) → "lite" jatuh ke router, tier lain jatuh ke synthesis.
     */
    tier: (tiers: TierRow[], key: string) => {
      const row = tiers.find(t => t.tier === key);
      if (row) return compat(row.model_id);
      return key === "lite" ? provider.router() : provider.synthesis();
    },
  };
  return provider;
}

/**
 * Thinking effort per panggilan. @ai-sdk/openai-compatible memetakan reasoningEffort → body
 * `reasoning_effort`. Tanpa effort = tidak ada field sama sekali, jadi model non-reasoning
 * tidak pernah menerima parameter yang ditolaknya.
 */
export const providerOptionsFor = (effort?: Effort | null) =>
  effort ? { [PROVIDER_NAME]: { reasoningEffort: effort } } as { llm: { reasoningEffort: Effort } } : undefined;

/**
 * Panggilan router (dispatcher, text-to-SQL, guardrail model) = keputusan kecil ber-skema
 * strict, bukan jawaban yang dibaca orang. Reasoning dimatikan: terukur 1,7 dtk vs 2,5 dtk
 * (effort low) per panggilan, keputusan sama. Model yang tidak mengenal "none" mengabaikannya.
 */
export const ROUTER_OPTIONS: { llm: { reasoningEffort: WireEffort } } = { llm: { reasoningEffort: "none" } };
/** Text-to-SQL butuh sedikit penalaran (semantik periode, agregasi). Terukur ≈ +0,8 dtk vs "none". */
export const SQL_OPTIONS: { llm: { reasoningEffort: Effort } } = { llm: { reasoningEffort: "low" } };
