import { handleMessage } from "@/lib/agent/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

// Canal web (simulador de WhatsApp del panel): texto, audio ya convertido a WAV en el navegador y foto.
export async function POST(req: Request) {
  const body = (await req.json()) as { text?: string; audioWavBase64?: string; imageDataUrl?: string };
  const audioWav = body.audioWavBase64 ? new Uint8Array(Buffer.from(body.audioWavBase64, "base64")) : undefined;
  if (!body.text?.trim() && !audioWav && !body.imageDataUrl) {
    return Response.json({ error: "Mandá texto, audio o foto" }, { status: 400 });
  }
  const r = await handleMessage({ channel: "web", from: "web", text: body.text, audioWav, imageDataUrl: body.imageDataUrl });
  return Response.json(r);
}
