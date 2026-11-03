import { waitUntil } from "@vercel/functions";
import { extractMessages, processWhatsApp, sendText, verifySignature } from "@/lib/channels/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 120;

// Handshake de verificación del webhook (Meta llama con hub.challenge).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ok =
    u.searchParams.get("hub.mode") === "subscribe" &&
    u.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new Response(u.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }
  const messages = extractMessages(JSON.parse(raw));
  waitUntil(
    (async () => {
      for (const m of messages) {
        try {
          await processWhatsApp(m);
        } catch (e) {
          console.error("whatsapp", m.id, e);
          await sendText(m.from, "Uh, tuve un problema con ese mensaje. ¿Me lo mandás de nuevo?").catch(() => {});
        }
      }
    })(),
  );
  return new Response("ok");
}
