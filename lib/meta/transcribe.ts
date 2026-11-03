import { isMock, MetaApiError, metaFetch, models } from "./client";

export interface Transcription {
  transcript: string;
  audioDurationMs: number;
}

async function send(wav: Uint8Array, settings: Record<string, unknown>) {
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
  form.append("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "audio.wav");
  const res = await metaFetch("/asr/transcribe", { method: "POST", headers: { Accept: "application/json" }, body: form });
  return (await res.json()) as { transcript?: string; audioDurationMs?: number };
}

/**
 * POST /v1/asr/transcribe (multipart). El audio tiene que ser WAV mono PCM 16 bit a 16 o 24 kHz.
 * `keywords` sesga el reconocimiento hacia nombres del catálogo (Playadito, Cindor, Jorgito...).
 */
export async function transcribe(wav: Uint8Array, keywords: string[] = []): Promise<Transcription> {
  if (isMock()) return { transcript: process.env.SOCIO_MOCK_TRANSCRIPT || "llegaron dos cajas de playadito", audioDurationMs: 3000 };

  const base = { model: models.transcribe(), audioEncoding: "WAV", mode: "PUSH_TO_TALK" };
  const bias = (process.env.SOCIO_LANGUAGE_BIAS || "es").split(",").map((s) => s.trim()).filter(Boolean);
  let body;
  try {
    body = await send(wav, { ...base, languageBias: bias, keywords: keywords.slice(0, 100) });
  } catch (e) {
    // El formato exacto de languageBias/keywords no está documentado con ejemplos: si el
    // servidor los rechaza (400), reintentamos sin sesgo en lugar de perder el audio.
    if (!(e instanceof MetaApiError) || e.status !== 400) throw e;
    body = await send(wav, base);
  }
  return { transcript: (body.transcript ?? "").trim(), audioDurationMs: body.audioDurationMs ?? 0 };
}
