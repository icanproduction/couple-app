// Saldo & pemakaian akun (OpenRouter GET /credits → { data: { total_credits, total_usage } }, USD).
// Dibaca server-side; key tidak pernah sampai browser. Caching (mis. revalidate 5 menit) = urusan fetchImpl.
export async function fetchCredits(o: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<{ totalCredits: number; totalUsage: number } | null> {
  const fetchImpl = o.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${o.baseUrl.replace(/\/$/, "")}/credits`, {
      headers: { Authorization: `Bearer ${o.apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
    return { totalCredits: Number(json.data?.total_credits ?? 0), totalUsage: Number(json.data?.total_usage ?? 0) };
  } catch {
    return null;
  }
}
