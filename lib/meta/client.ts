// Cliente mínimo de Meta Model API (https://dev.meta.ai/docs). Sin SDK para controlar
// exactamente qué se envía: Chat Completions con salida estructurada, transcripción y SAM 3.1.

export const isMock = () => process.env.SOCIO_MOCK === "1";

export const models = {
  planner: () => process.env.SOCIO_PLANNER_MODEL || "muse-spark-1.3",
  verifier: () => process.env.SOCIO_VERIFIER_MODEL || process.env.SOCIO_PLANNER_MODEL || "muse-spark-1.3",
  transcribe: () => process.env.SOCIO_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0",
  sam: () => process.env.SOCIO_SAM_MODEL || "sam-3.1",
};

export function baseUrl() {
  return (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
}

export function apiKey() {
  const k = process.env.MODEL_API_KEY;
  if (!k) throw new Error("Falta MODEL_API_KEY (o activá SOCIO_MOCK=1)");
  return k;
}

export class MetaApiError extends Error {
  constructor(public status: number, public body: string, public endpoint: string) {
    super(`Meta Model API ${endpoint} → HTTP ${status}: ${body.slice(0, 400)}`);
  }
}

export async function metaFetch(path: string, init: RequestInit & { retries?: number } = {}) {
  const { retries = 2, ...rest } = init;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...rest,
      headers: { Authorization: `Bearer ${apiKey()}`, ...(rest.headers ?? {}) },
      cache: "no-store",
    });
    if (res.ok) return res;
    // 429 y 5xx se reintentan con backoff exponencial; el resto falla de inmediato.
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      continue;
    }
    throw new MetaApiError(res.status, await res.text(), path);
  }
}

export async function listModels(): Promise<string[]> {
  const res = await metaFetch("/models", { retries: 0 });
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((m) => m.id);
}
