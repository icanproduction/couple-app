import { describe, expect, it, vi } from "vitest";
import { capabilitiesFromParams, fetchModelCatalog, findModel, pdfNative, toModelInfo, visionModels } from "./catalog";

describe("capabilitiesFromParams", () => {
  it("reads tools/reasoning/effort/structured from supported_parameters", () => {
    expect(capabilitiesFromParams(["tools", "reasoning", "reasoning_effort", "structured_outputs"]))
      .toEqual({ tools: true, reasoning: true, effort: true, structured: true });
    expect(capabilitiesFromParams(["temperature"]))
      .toEqual({ tools: false, reasoning: false, effort: false, structured: false });
    expect(capabilitiesFromParams(undefined).tools).toBe(false);
  });

  it("response_format counts as structured; reasoning without reasoning_effort still allows effort", () => {
    const c = capabilitiesFromParams(["response_format", "reasoning"]);
    expect(c.structured).toBe(true);
    expect(c.effort).toBe(true);
  });
});

describe("toModelInfo", () => {
  it("prices per million tokens and context", () => {
    const m = toModelInfo({
      id: "x/y", name: "Y", context_length: 1000,
      pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: ["tools"],
    });
    expect(m).toMatchObject({ id: "x/y", name: "Y", inPerM: 1, outPerM: 2, ctx: 1000, caps: { tools: true, reasoning: false } });
  });

  it("missing fields do not throw", () => {
    expect(toModelInfo({ id: "a/b" })).toMatchObject({ id: "a/b", name: "a/b", ctx: 0, inPerM: 0, outPerM: 0 });
  });

  it("reads input_modalities and filters vision models", () => {
    const raw = [
      { id: "a/text", supported_parameters: [] },
      { id: "b/vision", architecture: { input_modalities: ["text", "image"] }, supported_parameters: [] },
      { id: "c/pdf", architecture: { input_modalities: ["text", "image", "file"] }, supported_parameters: [] },
    ].map(toModelInfo);
    expect(visionModels(raw).map(m => m.id)).toEqual(["b/vision", "c/pdf"]);
    expect(pdfNative(raw[2])).toBe(true);
    expect(pdfNative(raw[1])).toBe(false);
  });
});

describe("findModel", () => {
  it("null when absent", () => {
    const cat = [toModelInfo({ id: "a/b" })];
    expect(findModel(cat, "a/b")?.id).toBe("a/b");
    expect(findModel(cat, "z/z")).toBeNull();
  });
});

describe("fetchModelCatalog", () => {
  it("drops floating aliases and :free models, sorts by id, hits {base}/models", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://llm.example/api/v1/models");
      return new Response(JSON.stringify({ data: [
        { id: "z/model" }, { id: "~vendor/latest" }, { id: "a/model:free" }, { id: "b/model" },
      ] }));
    });
    const cat = await fetchModelCatalog({ baseUrl: "https://llm.example/api/v1/", fetchImpl });
    expect(cat.map(m => m.id)).toEqual(["b/model", "z/model"]);
  });

  it("returns [] on HTTP error or network failure (UI falls back to manual input)", async () => {
    expect(await fetchModelCatalog({ baseUrl: "https://x", fetchImpl: async () => new Response("no", { status: 500 }) })).toEqual([]);
    expect(await fetchModelCatalog({ baseUrl: "https://x", fetchImpl: async () => { throw new Error("offline"); } })).toEqual([]);
  });
});
