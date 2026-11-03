import { isMock, metaFetch, models } from "./client";

export interface SamBox {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w?: number;
  h?: number;
  c?: number;
}

export interface SamFrame {
  frame: number;
  boxes: SamBox[];
}

/**
 * Parser de la salida de SAM 3.1 (dev.meta.ai/docs/sam/reading-segmentation):
 * una línea por frame, `<Nf>` seguido de registros separados por coma, cada uno
 * `id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|><|mask;...|>`. Cero coincidencias = texto vacío.
 */
export function parseSamOutput(text: string): SamFrame[] {
  const frames: SamFrame[] = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/<(\d+)f>/);
    if (!marker) continue;
    const boxes: SamBox[] = [];
    const re = /([A-Za-z0-9_-]+)\s*<\|box;([^|]*)\|>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const fields: Record<string, number> = {};
      for (const kv of m[2].split(";")) {
        const [k, v] = kv.split("=");
        if (k && v !== undefined && !Number.isNaN(Number(v))) fields[k.trim()] = Number(v);
      }
      boxes.push({ id: m[1], x1: fields.x1, y1: fields.y1, x2: fields.x2, y2: fields.y2, w: fields.w, h: fields.h, c: fields.c });
    }
    frames.push({ frame: Number(marker[1]), boxes });
  }
  return frames;
}

/** Junta el texto de un stream SSE de la Responses API (eventos response.output_text.delta). */
export function collectSseText(sse: string): string {
  let out = "";
  for (const block of sse.split(/\n\n/)) {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") continue;
    try {
      const ev = JSON.parse(data) as { type?: string; delta?: string };
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
        out += ev.delta.endsWith("\n") ? ev.delta : ev.delta + "\n";
      }
    } catch {
      /* línea no JSON: ignorar */
    }
  }
  return out;
}

export const MOCK_SAM_OUTPUT =
  "<0f> 0<|box;x1=12;y1=40;x2=118;y2=390;w=1024;h=768|><|mask;x=0;y=0;data=1,1,~0|>," +
  "1<|box;x1=130;y1=42;x2=236;y2=388;w=1024;h=768|><|mask;x=0;y=0;data=1,1,~0|>," +
  "3<|box;x1=250;y1=38;x2=356;y2=392;w=1024;h=768|><|mask;x=0;y=0;data=1,1,~0|>";

/** Segmenta una imagen con un prompt de sustantivo corto ("soda bottle") y devuelve el conteo. */
export async function samCount(imageUrl: string, nounPhrase: string): Promise<{ count: number; boxes: SamBox[]; raw: string }> {
  let raw: string;
  if (isMock()) {
    raw = MOCK_SAM_OUTPUT;
  } else {
    const res = await metaFetch("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model: models.sam(),
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: nounPhrase },
              { type: "input_image", image_url: imageUrl },
            ],
          },
        ],
      }),
    });
    raw = collectSseText(await res.text());
  }
  const frame = parseSamOutput(raw)[0];
  const boxes = frame?.boxes ?? [];
  return { count: boxes.length, boxes, raw };
}
