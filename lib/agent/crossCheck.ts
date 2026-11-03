import { isMock, models } from "../meta/client";
import { sparkJson } from "../meta/spark";
import type { Check, ResolvedAction } from "../types";
import { ACTION_LABELS } from "../types";

// Segunda lectura independiente: otro llamado al modelo (SOCIO_VERIFIER_MODEL) que no vio el plan
// original, solo el mensaje y la acción ya resuelta en lenguaje llano. Si no está de acuerdo, la
// acción no se bloquea pero pasa a requerir aprobación humana.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "agrees", "reason"],
        properties: { index: { type: "integer" }, agrees: { type: "boolean" }, reason: { type: "string" } },
      },
    },
  },
};

const PAYMENT: Record<string, string> = { cash: "efectivo", transfer: "transferencia", credit: "fiado" };
const $ = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

export function describe(a: ResolvedAction): string {
  const label =
    a.type === "inventory.adjust"
      ? (a.units ?? a.quantity ?? 0) >= 0
        ? "Entrada de mercadería"
        : "Baja de stock (rotura / vencido)"
      : ACTION_LABELS[a.type];
  const parts = [label];
  if (a.productName) parts.push(a.productName);
  if (a.resolvedItems?.length) parts.push(a.resolvedItems.map((i) => `${i.units} × ${i.productName}`).join(", "));
  if (a.concept) parts.push(a.concept);
  if (a.dueDate) parts.push(`entrega ${a.dueDate}`);
  if (a.units !== undefined) parts.push(`${a.units} unidades`);
  if (a.total !== undefined) parts.push(`total ${$(a.total)}`);
  if (a.newPrice) parts.push(`precio nuevo ${$(a.newPrice)}`);
  if (a.customerName) parts.push(`cliente ${a.customerName}`);
  if (a.amount) parts.push(`monto ${$(a.amount)}`);
  if (a.payment) parts.push(PAYMENT[a.payment] ?? a.payment);
  return parts.join(" · ");
}

export async function crossCheck(message: string, actions: ResolvedAction[]): Promise<Check[][]> {
  if (!actions.length) return [];
  if (isMock() || process.env.SOCIO_CROSS_CHECK === "0") return actions.map(() => []);
  const list = actions.map((a, i) => `${i}. ${describe(a)}`).join("\n");
  try {
    const r = await sparkJson<{ reviews: { index: number; agrees: boolean; reason: string }[] }>({
      model: models.verifier(),
      system:
        "Sos un auditor. Te paso el mensaje de un comerciante y las operaciones que un asistente va a cargar en su sistema. " +
        "Los nombres completos de los artículos (marca, tamaño), los precios de lista, la conversión de cajas a unidades y " +
        "los nombres completos de los clientes salen del catálogo y ya fueron verificados en código: NO los objetes porque " +
        "el mensaje no los diga. Tu trabajo es decir si el mensaje pide ESA operación: el tipo (entrada, venta, fiado, cobro, " +
        "pedido, gasto, precio, consulta), el artículo o cliente al que se refiere, y la cantidad o monto que dijo. " +
        "Si algo de eso contradice el mensaje o no está pedido, agrees = false. reason en español, una línea corta.",
      text: `Mensaje:\n"""${message}"""\n\nOperaciones:\n${list}`,
      schemaName: "socio_cross_check",
      reasoningEffort: process.env.SOCIO_VERIFIER_EFFORT || "minimal",
      schema: SCHEMA,
    });
    return actions.map((_, i) => {
      const rv = r.reviews.find((x) => x.index === i);
      if (!rv) return [{ id: "cross-check", status: "warn", message: "El auditor no revisó esta acción" }];
      return [{ id: "cross-check", status: rv.agrees ? "pass" : "warn", message: `Auditor: ${rv.reason}` }];
    });
  } catch (e) {
    return actions.map(() => [{ id: "cross-check", status: "warn", message: `Auditor no disponible: ${(e as Error).message.slice(0, 80)}` }]);
  }
}
