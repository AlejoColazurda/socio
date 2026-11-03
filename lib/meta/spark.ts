import { metaFetch } from "./client";

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface JsonCallInput {
  model: string;
  system: string;
  text: string;
  images?: string[]; // data URLs o URLs públicas
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
}

/** Chat Completions con response_format json_schema (dev.meta.ai/docs/structured-output). */
export async function sparkJson<T>(input: JsonCallInput): Promise<T> {
  const content: ContentPart[] = [{ type: "text", text: input.text }];
  for (const url of input.images ?? []) content.push({ type: "image_url", image_url: { url } });

  const res = await metaFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: input.schemaName, strict: true, schema: input.schema },
      },
    }),
  });
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const raw = body.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Algunos modelos envuelven el JSON en un bloque de código.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`Respuesta no es JSON: ${raw.slice(0, 200)}`);
  }
}
