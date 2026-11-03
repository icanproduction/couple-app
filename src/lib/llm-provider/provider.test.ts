import { describe, expect, it } from "vitest";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  DEFAULT_ROUTER,
  DEFAULT_SYNTHESIS,
  ROUTER_OPTIONS,
  SQL_OPTIONS,
  createLlmProvider,
  providerOptionsFor,
  resolveModelIds,
} from "./provider";
import type { Effort, ModelIds, WireEffort } from "./types";

// Fake factory: records the settings and returns a model stub with a modelId.
function fakeFactory() {
  const seen: { settings?: unknown; created: string[] } = { created: [] };
  const factory = (settings: unknown) => {
    seen.settings = settings;
    return (modelId: string) => {
      seen.created.push(modelId);
      return { modelId };
    };
  };
  return { factory, seen };
}

const models: ModelIds = { router: "r/router", synthesis: "s/synth", narrator: "n/narr" };
const cfg = { baseUrl: "https://llm.example/api/v1/", apiKey: "k", models };

describe("resolveModelIds", () => {
  it("falls back to defaults; narrator follows synthesis", () => {
    expect(resolveModelIds({})).toEqual({ router: DEFAULT_ROUTER, synthesis: DEFAULT_SYNTHESIS, narrator: DEFAULT_SYNTHESIS });
    expect(resolveModelIds({ LLM_MODEL_SYNTHESIS: "  " })).toEqual({ router: DEFAULT_ROUTER, synthesis: DEFAULT_SYNTHESIS, narrator: DEFAULT_SYNTHESIS });
  });

  it("reads overrides from the env-like record", () => {
    expect(resolveModelIds({ LLM_MODEL_ROUTER: "a/r", LLM_MODEL_SYNTHESIS: "b/s", LLM_MODEL_NARRATOR: "c/n" }))
      .toEqual({ router: "a/r", synthesis: "b/s", narrator: "c/n" });
    expect(resolveModelIds({ LLM_MODEL_SYNTHESIS: "b/s" }).narrator).toBe("b/s");
  });

  it("accepts app-specific defaults", () => {
    expect(resolveModelIds({}, { router: "x/r", synthesis: "x/s" })).toEqual({ router: "x/r", synthesis: "x/s", narrator: "x/s" });
  });

  it("narrator default precedence: env LLM_MODEL_NARRATOR > defaults.narrator > resolved synthesis", () => {
    // defaults.narrator wins over the resolved synthesis when env is silent.
    expect(resolveModelIds({}, { synthesis: "x/s", narrator: "x/n" })).toEqual({ router: DEFAULT_ROUTER, synthesis: "x/s", narrator: "x/n" });
    // env LLM_MODEL_NARRATOR still wins over defaults.narrator.
    expect(resolveModelIds({ LLM_MODEL_NARRATOR: "env/n" }, { synthesis: "x/s", narrator: "x/n" }))
      .toEqual({ router: DEFAULT_ROUTER, synthesis: "x/s", narrator: "env/n" });
    // no defaults.narrator → falls back to resolved synthesis, unchanged behaviour.
    expect(resolveModelIds({}, { synthesis: "x/s" }).narrator).toBe("x/s");
  });
});

describe("createLlmProvider", () => {
  it("is lazy: building the provider does not create the client", () => {
    const { factory, seen } = fakeFactory();
    createLlmProvider(cfg, { createOpenAICompatible: factory });
    expect(seen.settings).toBeUndefined();
  });

  it("configures strict structured output and trims the base URL", () => {
    const { factory, seen } = fakeFactory();
    createLlmProvider(cfg, { createOpenAICompatible: factory }).router();
    expect(seen.settings).toEqual({ name: "llm", baseURL: "https://llm.example/api/v1", apiKey: "k", supportsStructuredOutputs: true });
  });

  it("maps router/synthesis/narrator/byId to model ids", () => {
    const { factory } = fakeFactory();
    const p = createLlmProvider(cfg, { createOpenAICompatible: factory });
    expect(p.router().modelId).toBe("r/router");
    expect(p.synthesis().modelId).toBe("s/synth");
    expect(p.narrator().modelId).toBe("n/narr");
    expect(p.byId("z/agent").modelId).toBe("z/agent");
    expect(p.byId("  ").modelId).toBe("s/synth");
    expect(p.byId(null).modelId).toBe("s/synth");
  });

  it("works with the real @ai-sdk/openai-compatible factory", () => {
    const p = createLlmProvider(cfg, { createOpenAICompatible });
    expect((p.synthesis() as { modelId: string }).modelId).toBe("s/synth");
  });
});

describe("tier (owner-switchable model tiers)", () => {
  const tiers = [
    { tier: "lite", model_id: "deepseek/deepseek-v4-flash" },
    { tier: "pro", model_id: "z-ai/glm-5.3" },
  ];
  const { factory } = fakeFactory();
  const p = createLlmProvider(cfg, { createOpenAICompatible: factory });

  it("matching row → that row's model", () => {
    expect(p.tier(tiers, "lite").modelId).toBe("deepseek/deepseek-v4-flash");
    expect(p.tier(tiers, "pro").modelId).toBe("z-ai/glm-5.3");
  });

  it("no row + lite → router model", () => {
    expect(p.tier([], "lite").modelId).toBe("r/router");
  });

  it("no row + any other key → synthesis model", () => {
    expect(p.tier([], "pro").modelId).toBe("s/synth");
    expect(p.tier([], "max").modelId).toBe("s/synth");
    expect(p.tier([], "ocr").modelId).toBe("s/synth");
  });

  it("other rows present but not the requested key → still falls back", () => {
    expect(p.tier([tiers[1]], "lite").modelId).toBe("r/router");
  });
});

describe("provider options", () => {
  it("providerOptionsFor adds reasoning effort only when given", () => {
    expect(providerOptionsFor("high")).toEqual({ llm: { reasoningEffort: "high" } });
    expect(providerOptionsFor(null)).toBeUndefined();
    expect(providerOptionsFor(undefined)).toBeUndefined();
  });

  it("router calls turn reasoning off; SQL calls keep it low", () => {
    expect(ROUTER_OPTIONS).toEqual({ llm: { reasoningEffort: "none" } });
    expect(SQL_OPTIONS).toEqual({ llm: { reasoningEffort: "low" } });
  });

  it("type-only: ROUTER_OPTIONS' wire value is WireEffort (includes \"none\"), not the narrower Effort", () => {
    // Compiles only if ROUTER_OPTIONS.llm.reasoningEffort is typed WireEffort, not Effort — "none"
    // is not a member of Effort, so this assignment would fail tsc if the type were narrowed back.
    const wire: WireEffort = ROUTER_OPTIONS.llm.reasoningEffort;
    const sqlEffort: Effort = SQL_OPTIONS.llm.reasoningEffort;
    expect(wire).toBe("none");
    expect(sqlEffort).toBe("low");
  });
});
