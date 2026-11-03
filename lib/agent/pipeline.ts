import { randomUUID } from "node:crypto";
import { getProfile } from "../business";
import { getConnector } from "../connectors";
import { samCount } from "../meta/sam";
import { transcribe } from "../meta/transcribe";
import { getStore } from "../store";
import type { ActionRecord, InboundMessage, MessageRecord, ProposedAction } from "../types";
import { crossCheck, describe } from "./crossCheck";
import { plan } from "./planner";
import { candidateProducts, pesos } from "./text";
import { riskOf, verifyAction } from "./verify";

const now = () => new Date().toISOString();

function keywordsFrom(products: { name: string; brand?: string; aliases?: string[] }[]) {
  const set = new Set<string>();
  for (const p of products) {
    if (p.brand) set.add(p.brand);
    for (const a of p.aliases ?? []) if (a.split(" ").length <= 2) set.add(a);
  }
  return [...set].slice(0, 100);
}

/**
 * Circuito completo de un mensaje:
 * audio → Muse Voice Transcribe · foto → SAM 3.1 · texto → Muse Spark (plan estructurado)
 * → verificación en código → auditor independiente → política de riesgo → ejecución o aprobación.
 */
export async function handleMessage(msg: InboundMessage): Promise<{ message: MessageRecord; actions: ActionRecord[] }> {
  const store = getStore();
  if (msg.externalId) {
    const dup = await store.findMessageByExternalId(msg.externalId);
    if (dup) {
      const all = await store.recent(200);
      return { message: dup, actions: all.actions.filter((a) => dup.actionIds.includes(a.id)) };
    }
  }

  const timings: Record<string, number> = {};
  const t = async <T,>(k: string, fn: () => Promise<T>) => {
    const s = Date.now();
    try {
      return await fn();
    } finally {
      timings[k] = Date.now() - s;
    }
  };

  const record: MessageRecord = {
    id: randomUUID(),
    channel: msg.channel,
    from: msg.from,
    externalId: msg.externalId,
    text: msg.text,
    transcript: "",
    hadAudio: Boolean(msg.audioWav),
    hadImage: Boolean(msg.imageDataUrl),
    vision: null,
    summary: "",
    reply: "",
    clarification: null,
    actionIds: [],
    createdAt: now(),
    timings,
  };
  const actions: ActionRecord[] = [];

  try {
    const connector = await getConnector();
    const [catalog, customers, profile] = await Promise.all([connector.listProducts(), connector.listCustomers(), getProfile()]);

    let heard = "";
    if (msg.audioWav) heard = (await t("transcribe", () => transcribe(msg.audioWav!, keywordsFrom(catalog)))).transcript;
    const message = [msg.text?.trim(), heard].filter(Boolean).join("\n");
    record.transcript = message;

    const candidates = candidateProducts(catalog, message || catalog.map((p) => p.name).join(" "));
    const p = await t("plan", () => plan(message, candidates, customers, profile, msg.imageDataUrl));
    record.summary = p.summary;
    record.clarification = p.clarification;

    let proposed: ProposedAction[] = p.actions ?? [];
    let visionIdx = -1;
    if (msg.imageDataUrl && p.vision?.nounPhrase) {
      const v = await t("sam", () => samCount(msg.imageDataUrl!, p.vision!.nounPhrase));
      record.vision = { prompt: p.vision.nounPhrase, count: v.count, boxes: v.boxes.map((b) => [b.x1, b.y1, b.x2, b.y2]) };
      visionIdx = proposed.findIndex((a) => a.type === "inventory.count" && (a.quantity === null || a.quantity === undefined));
      if (visionIdx < 0) {
        // El conteo de SAM nunca se pierde: si el plan no trajo la acción, la armamos en código.
        proposed = [
          ...proposed,
          {
            type: "inventory.count", productId: p.vision.productId, quantity: null, unit: "unit", unitPrice: null,
            newPrice: null, customerName: null, amount: null, payment: null, evidence: message || "foto",
          },
        ];
        visionIdx = proposed.length - 1;
      }
      proposed = proposed.map((a, i) => (i === visionIdx ? { ...a, quantity: v.count, unit: "unit" } : a));
    }

    const verified = await t("verify", () =>
      Promise.all(
        proposed.map((a, i) =>
          verifyAction(a, { connector, message, candidates, customers, fromVision: i === visionIdx && Boolean(record.vision) }),
        ),
      ),
    );
    const cross = await t("crossCheck", () => crossCheck(message, verified.map((v) => v.action)));

    for (let i = 0; i < verified.length; i++) {
      const checks = [...verified[i].checks, ...(cross[i] ?? [])];
      const risk = riskOf(verified[i].action, checks, profile);
      const rec: ActionRecord = {
        id: randomUUID(),
        messageId: record.id,
        action: verified[i].action,
        checks,
        risk,
        status: risk === "blocked" ? "blocked" : risk === "approval" ? "pending_approval" : "executed",
        createdAt: now(),
      };
      if (risk === "auto") {
        try {
          rec.result = await connector.execute(rec.action);
          rec.status = rec.action.type === "query.stock" ? "answered" : "executed";
          rec.decidedAt = now();
          rec.decidedBy = "socio (automático)";
        } catch (e) {
          rec.status = "failed";
          rec.result = (e as Error).message;
        }
      }
      actions.push(rec);
      await store.saveAction(rec);
    }
    record.actionIds = actions.map((a) => a.id);
    record.reply = buildReply(record, actions);
  } catch (e) {
    record.error = (e as Error).message;
    record.reply = "Uh, tuve un problema procesando eso. Probá de nuevo en un ratito.";
  }

  await store.saveMessage(record);
  return { message: record, actions };
}

export function buildReply(m: MessageRecord, actions: ActionRecord[]): string {
  const lines: string[] = [];
  if (m.vision) lines.push(`📷 Conté ${m.vision.count} en la foto.`);
  for (const a of actions) {
    if (a.status === "executed" || a.status === "answered") lines.push(`✅ ${a.result}`);
    else if (a.status === "pending_approval") {
      const why = a.checks.filter((c) => c.status === "warn").map((c) => c.message);
      lines.push(`🟡 ${describe(a.action)}${why.length ? ` (${why.join("; ")})` : ""}. ¿Confirmás?`);
    } else if (a.status === "blocked") {
      const why = a.checks.filter((c) => c.status === "fail").map((c) => c.message);
      lines.push(`⛔ No lo cargué: ${why.join("; ")}`);
    } else if (a.status === "failed") lines.push(`❌ Falló: ${a.result}`);
  }
  if (m.clarification) lines.push(`❓ ${m.clarification}`);
  if (!lines.length) lines.push("No encontré nada para anotar. ¿Me lo decís de otra forma?");
  return lines.join("\n");
}

/** El dueño confirma: se vuelve a verificar contra el estado actual antes de ejecutar. */
export async function decide(actionId: string, approve: boolean, by: string): Promise<ActionRecord> {
  const store = getStore();
  // claimAction la marca "processing" antes de cualquier await: un doble toque en el botón
  // de WhatsApp (o en el panel) no puede ejecutarla dos veces.
  const rec = await store.claimAction(actionId);
  if (!rec) {
    const current = await store.getAction(actionId);
    if (!current) throw new Error("Acción inexistente");
    return current;
  }

  rec.decidedAt = now();
  rec.decidedBy = by;
  if (!approve) {
    rec.status = "rejected";
    rec.result = "Cancelado por el dueño";
  } else {
    const connector = await getConnector();
    const [catalog, customers] = await Promise.all([connector.listProducts(), connector.listCustomers()]);
    // Re-verificación: el stock pudo cambiar entre la propuesta y la confirmación.
    const re = await verifyAction(rec.action, {
      connector,
      message: rec.action.evidence,
      candidates: catalog,
      customers,
      fromVision: true,
    });
    const failed = re.checks.filter((c) => c.status === "fail");
    if (failed.length) {
      rec.status = "blocked";
      rec.result = `Al confirmar cambió el estado: ${failed.map((c) => c.message).join("; ")}`;
    } else {
      try {
        rec.action = re.action;
        rec.result = await connector.execute(re.action);
        rec.status = "executed";
      } catch (e) {
        rec.status = "failed";
        rec.result = (e as Error).message;
      }
    }
  }
  await store.saveAction(rec);
  return rec;
}

export { pesos };
