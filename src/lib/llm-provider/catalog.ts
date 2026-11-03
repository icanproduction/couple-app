import type { ModelCaps, ModelInfo, RawModel } from "./types";

// Katalog model (format OpenRouter GET {base}/models, publik tanpa key): sumber kebenaran
// "model ini bisa apa" — tools, reasoning (+ knob effort), structured output, modality.
// Gagal diambil → [] dan UI jatuh ke input manual; konfigurasi tetap bisa disimpan.

export function capabilitiesFromParams(params: string[] | undefined): ModelCaps {
  const p = new Set(params ?? []);
  return {
    tools: p.has("tools"),
    reasoning: p.has("reasoning"),
    // `reasoning` menerima {effort}; `reasoning_effort` = knob gaya OpenAI.
    effort: p.has("reasoning_effort") || p.has("reasoning"),
    structured: p.has("structured_outputs") || p.has("response_format"),
  };
}

const perM = (v: string | undefined) => Math.round(Number(v ?? 0) * 1e6 * 1e4) / 1e4;

export const toModelInfo = (m: RawModel): ModelInfo => ({
  id: m.id,
  name: m.name ?? m.id,
  ctx: m.context_length ?? 0,
  inPerM: perM(m.pricing?.prompt),
  outPerM: perM(m.pricing?.completion),
  caps: capabilitiesFromParams(m.supported_parameters),
  inputs: m.architecture?.input_modalities ?? ["text"],
});

export const visionModels = (c: ModelInfo[]) => c.filter(m => m.inputs.includes("image") || m.inputs.includes("file"));

export const pdfNative = (m: ModelInfo) => m.inputs.includes("file");

export const findModel = (catalog: ModelInfo[], id: string): ModelInfo | null => catalog.find(m => m.id === id) ?? null;

/**
 * Ambil katalog. Buang "~…" (alias yang isinya bisa berganti diam-diam, jangan dipin) dan
 * ":free" (kuota komunitas, tidak layak produksi). Caching (mis. revalidate 1 jam di Next)
 * adalah urusan fetchImpl milik app.
 */
export async function fetchModelCatalog(o: { baseUrl: string; fetchImpl?: typeof fetch }): Promise<ModelInfo[]> {
  const fetchImpl = o.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${o.baseUrl.replace(/\/$/, "")}/models`);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawModel[] };
    return (json.data ?? [])
      .filter(m => !m.id.startsWith("~") && !m.id.includes(":free"))
      .map(toModelInfo)
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
