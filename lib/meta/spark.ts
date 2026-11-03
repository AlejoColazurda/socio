import { MetaApiError, metaFetch } from "./client";

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

  const call = (system: string, response_format: Record<string, unknown>) =>
    metaFetch("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format,
      }),
    });

  let res: Response;
  try {
    // strict:false: la salida igual queda restringida al schema, y evitamos el 400 si el
    // subconjunto estricto no admite tipos nullable ("string" | null).
    res = await call(input.system, {
      type: "json_schema",
      json_schema: { name: input.schemaName, strict: false, schema: input.schema },
    });
  } catch (e) {
    // Si el servidor rechaza el schema, pedimos JSON libre con el schema en el prompt.
    // No se pierde seguridad: todo lo que vuelve se valida igual en código.
    if (!(e instanceof MetaApiError) || e.status !== 400) throw e;
    res = await call(
      `${input.system}\n\nRespondé SOLO con un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(input.schema)}`,
      { type: "json_object" },
    );
  }
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
