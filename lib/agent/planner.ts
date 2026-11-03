import { isMock, models } from "../meta/client";
import { sparkJson } from "../meta/spark";
import type { ActionType, Customer, Product, ProposedAction } from "../types";
import { mockPlan } from "./mockPlanner";

export interface Plan {
  summary: string;
  actions: ProposedAction[];
  clarification: string | null;
  vision: { nounPhrase: string; productId: string | null } | null;
}

const ACTION_TYPES: ActionType[] = [
  "inventory.adjust",
  "inventory.count",
  "sale.record",
  "customer.charge",
  "customer.payment",
  "product.price",
  "query.stock",
];

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "actions", "clarification", "vision"],
  properties: {
    summary: { type: "string", description: "Resumen en una línea, en español rioplatense" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "productId", "quantity", "unit", "unitPrice", "newPrice", "customerName", "amount", "payment", "evidence"],
        properties: {
          type: { type: "string", enum: ACTION_TYPES },
          productId: nullable("string"),
          quantity: nullable("number"),
          unit: nullable("string", { enum: ["unit", "pack", null] }),
          unitPrice: nullable("number"),
          newPrice: nullable("number"),
          customerName: nullable("string"),
          amount: nullable("number"),
          payment: nullable("string", { enum: ["cash", "transfer", "credit", null] }),
          evidence: { type: "string", description: "Fragmento LITERAL del mensaje que justifica esta acción" },
        },
      },
    },
    clarification: nullable("string"),
    vision: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["nounPhrase", "productId"],
      properties: { nounPhrase: { type: "string" }, productId: nullable("string") },
    },
  },
} as const;

export function buildSystemPrompt(products: Product[], customers: Customer[]) {
  const catalog = products
    .map((p) => `- ${p.id} | ${p.name} | precio ${p.price} | stock ${p.stock}${p.unitsPerPack ? ` | caja/bulto = ${p.unitsPerPack} u.` : ""}`)
    .join("\n");
  const clients = customers.map((c) => `- ${c.name} (debe ${c.balance})`).join("\n") || "(sin cuentas corrientes)";
  return `Sos Socio, el empleado administrativo de un comercio argentino. El dueño te habla por WhatsApp
(audios transcriptos, texto y fotos) en español rioplatense, informal y con modismos.
Tu trabajo es convertir el mensaje en acciones concretas sobre su sistema. NUNCA ejecutás nada: proponés,
y el sistema verifica cada acción en código antes de tocar datos.

Tipos de acción:
- inventory.adjust: entra o sale mercadería sin venta (llegó pedido, rotura, vencido). quantity positivo suma, negativo resta.
- inventory.count: conteo físico, fija el stock. Si viene una foto para contar, dejá quantity en null y completá "vision".
- sale.record: venta. quantity, unitPrice solo si el mensaje dice un precio distinto, payment (cash/transfer/credit).
  Si es "fiado" o "a cuenta", payment = credit y customerName.
- customer.charge: anotar deuda (fiado) sin producto puntual. amount en pesos y customerName.
- customer.payment: un cliente paga. amount y customerName.
- product.price: cambio de precio. newPrice en pesos.
- query.stock: el dueño pregunta cuánto queda.

Reglas estrictas:
1. productId SOLO puede ser un ID del catálogo de abajo. Si no hay un producto que coincida con seguridad,
   no inventes: dejá actions vacío para esa parte y escribí una pregunta corta en "clarification".
2. unit = "pack" cuando dicen caja, bulto, pack o fardo; "unit" cuando son unidades sueltas.
3. "evidence" es una copia literal (palabra por palabra) del fragmento del mensaje que respalda la acción.
4. Montos en pesos enteros: "8 lucas" = 8000, "dos mil quinientos" = 2500.
5. Una acción por cada cosa distinta que pide el mensaje. Si el mensaje no pide nada, actions = [].
6. "vision": solo si hay foto para contar. nounPhrase en inglés, 1 a 3 palabras (ej. "soda bottle", "yerba package").

Catálogo (id | nombre | precio | stock):
${catalog || "(vacío)"}

Clientes con cuenta corriente:
${clients}`;
}

export async function plan(message: string, products: Product[], customers: Customer[], imageDataUrl?: string): Promise<Plan> {
  if (isMock()) return mockPlan(message, products, customers, Boolean(imageDataUrl));
  return sparkJson<Plan>({
    model: models.planner(),
    system: buildSystemPrompt(products, customers),
    text: message || "(mensaje sin texto, solo foto)",
    images: imageDataUrl ? [imageDataUrl] : [],
    schemaName: "socio_plan",
    schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
  });
}
