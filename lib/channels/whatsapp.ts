import { createHmac, timingSafeEqual } from "node:crypto";
import { describe } from "../agent/crossCheck";
import { decide, handleMessage } from "../agent/pipeline";
import { toWav16k } from "../audio";
import type { ActionRecord } from "../types";

// Canal WhatsApp Cloud API. El webhook responde 200 enseguida y procesa en segundo plano;
// la idempotencia por id de mensaje evita duplicar operaciones cuando Meta reintenta.

const graph = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;
const token = () => {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("Falta WHATSAPP_TOKEN");
  return t;
};

export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // en local se puede probar sin secreto
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isOwner(from: string): boolean {
  const owners = (process.env.SOCIO_OWNER_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Celulares de Argentina: WhatsApp manda 549… pero el dueño puede haberlo cargado como 54… (o al revés).
  return owners.length === 0 || owners.some((o) => argentineVariants(o).includes(from));
}

/** 5491112345678 ⇄ 541112345678: las dos formas en que aparece un celular argentino en la API. */
export function argentineVariants(n: string): string[] {
  if (n.startsWith("549")) return [n, `54${n.slice(3)}`];
  if (n.startsWith("54")) return [n, `549${n.slice(2)}`];
  return [n];
}

async function api(path: string, body: unknown) {
  const res = await fetch(`${graph()}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Envía un mensaje. Si el número es argentino y WhatsApp lo rechaza por no estar en la lista
 * permitida (error 131030 en números de prueba), reintenta con la otra forma (con o sin el 9).
 */
async function send(to: string, payload: Record<string, unknown>) {
  const [first, ...rest] = argentineVariants(to);
  try {
    return await api(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to: first, ...payload });
  } catch (e) {
    if (!rest.length || !String((e as Error).message).includes("131030")) throw e;
    return api(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to: rest[0], ...payload });
  }
}

export function sendText(to: string, text: string) {
  return send(to, { type: "text", text: { body: text.slice(0, 4096) } });
}

/** Botones de aprobación (WhatsApp permite hasta 3 por mensaje, títulos de hasta 20 caracteres). */
export function sendApproval(to: string, a: ActionRecord) {
  const warns = a.checks.filter((c) => c.status === "warn").map((c) => `• ${c.message}`);
  return send(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `🟡 ${describe(a.action)}${warns.length ? `\n${warns.join("\n")}` : ""}\n\n¿Lo cargo?`.slice(0, 1024) },
      action: {
        buttons: [
          { type: "reply", reply: { id: `ok:${a.id}`, title: "Sí, cargalo" } },
          { type: "reply", reply: { id: `no:${a.id}`, title: "No, cancelá" } },
        ],
      },
    },
  });
}

async function download(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await fetch(`${graph()}/${mediaId}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!meta.ok) throw new Error(`media ${mediaId}: ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!file.ok) throw new Error(`descarga ${mediaId}: ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: mime_type };
}

interface WaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string };
  image?: { id: string; caption?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
}

export function extractMessages(payload: unknown): WaMessage[] {
  const p = payload as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  return (p.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
}

export async function processWhatsApp(m: WaMessage) {
  if (!isOwner(m.from)) {
    await sendText(m.from, "Este número no está autorizado para operar el negocio.");
    return;
  }

  if (m.type === "interactive" && m.interactive?.button_reply) {
    const [verb, id] = m.interactive.button_reply.id.split(":");
    const rec = await decide(id, verb === "ok", `whatsapp:${m.from}`);
    const icon = rec.status === "executed" ? "✅" : rec.status === "rejected" ? "↩️" : "⛔";
    await sendText(m.from, `${icon} ${rec.result ?? rec.status}`);
    return;
  }

  let text = m.text?.body;
  let audioWav: Uint8Array | undefined;
  let imageDataUrl: string | undefined;
  if (m.audio) audioWav = await toWav16k((await download(m.audio.id)).bytes);
  if (m.image) {
    const img = await download(m.image.id);
    imageDataUrl = `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`;
    text = m.image.caption ?? text;
  }
  if (!text && !audioWav && !imageDataUrl) {
    await sendText(m.from, "Por ahora entiendo texto, audios y fotos 🙌");
    return;
  }

  const { message, actions } = await handleMessage({ channel: "whatsapp", from: m.from, externalId: m.id, text, audioWav, imageDataUrl });
  const pending = actions.filter((a) => a.status === "pending_approval");
  const done = message.reply
    .split("\n")
    .filter((l) => !l.startsWith("🟡"))
    .join("\n");
  if (message.hadAudio && message.transcript) await sendText(m.from, `🎙️ Escuché: "${message.transcript}"`);
  if (done.trim()) await sendText(m.from, done);
  for (const a of pending) await sendApproval(m.from, a);
}
