import type { BusinessProfile } from "../business";
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
  "order.create",
  "expense.record",
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
        required: [
          "type", "productId", "quantity", "unit", "unitPrice", "newPrice", "customerName", "amount", "payment",
          "items", "concept", "dueDate", "evidence",
        ],
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
          items: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["productId", "quantity", "unit"],
              properties: {
                productId: nullable("string"),
                quantity: nullable("number"),
                unit: nullable("string", { enum: ["unit", "pack", null] }),
              },
            },
          },
          concept: nullable("string"),
          dueDate: nullable("string"),
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

export function buildSystemPrompt(products: Product[], customers: Customer[], profile: BusinessProfile) {
  const catalog = products
    .map((p) => `- ${p.id} | ${p.name} | precio ${p.price} | stock ${p.stock}${p.unitsPerPack ? ` | caja/bulto = ${p.unitsPerPack} u.` : ""}`)
    .join("\n");
  const clients = customers.map((c) => `- ${c.name} (debe ${c.balance})`).join("\n") || "(sin cuentas corrientes)";
  return `Sos Socio, el empleado administrativo de "${profile.name}", una pyme del rubro ${profile.rubro}.
${profile.notes}
El dueño o su equipo te hablan por WhatsApp (audios transcriptos, texto y fotos) en español rioplatense,
informal y con modismos. Tu trabajo es convertir el mensaje en acciones concretas sobre su sistema.
NUNCA ejecutás nada: proponés, y el sistema verifica cada acción en código antes de tocar datos.

Tipos de acción:
- inventory.adjust: entra o sale mercadería sin venta (llegó mercadería, rotura, vencido). quantity positivo suma, negativo resta.
- inventory.count: conteo físico, fija el stock. Si viene una foto para contar, dejá quantity en null y completá "vision".
- sale.record: venta de mostrador de UN ${profile.itemsWord.replace(/s$/, "")}. quantity, unitPrice solo si dicen un precio distinto,
  payment (cash/transfer/credit). Si es "fiado" o "a cuenta", payment = credit y customerName.
- order.create: pedido de un cliente para preparar o entregar después ("pide", "me encargó", "para el jueves").
  items = un renglón por artículo (productId, quantity, unit), customerName y dueDate tal como lo dijeron.
- customer.charge: anotar deuda en la cuenta corriente sin artículo puntual. amount y customerName.
- customer.payment: un cliente paga o transfiere. amount y customerName.
- expense.record: un gasto del negocio o pago a proveedor (luz, alquiler, combustible, mercadería).
  amount, concept (corto) y customerName = proveedor si lo nombran.
- product.price: cambio de precio. newPrice en pesos.
- query.stock: preguntan cuánto queda.

Reglas estrictas:
1. productId SOLO puede ser un ID del catálogo de abajo. Si no hay un artículo que coincida con seguridad,
   no inventes: dejá esa parte afuera y escribí una pregunta corta en "clarification".
2. unit = "pack" cuando dicen caja, bulto, pack, cajón o fardo y el catálogo indica cuántas unidades trae;
   si el artículo del catálogo ya ES el bulto, unit = "unit".
3. "evidence" es una copia literal (palabra por palabra) del fragmento del mensaje que respalda la acción.
4. Montos en pesos enteros: "8 lucas" = 8000, "120 mil" = 120000, "dos mil quinientos" = 2500.
5. Una acción por cada cosa distinta que pide el mensaje. Si el mensaje no pide nada, actions = [].
6. Los campos que no aplican a una acción van en null.
7. "vision": solo si hay foto para contar. nounPhrase en inglés, 1 a 3 palabras (ej. "soda bottle", "cement bag").

Catálogo de ${profile.itemsWord} (id | nombre | precio | stock):
${catalog || "(vacío)"}

${profile.customersWord[0].toUpperCase()}${profile.customersWord.slice(1)} con cuenta corriente:
${clients}`;
}

export async function plan(
  message: string,
  products: Product[],
  customers: Customer[],
  profile: BusinessProfile,
  imageDataUrl?: string,
): Promise<Plan> {
  if (isMock()) return mockPlan(message, products, customers, Boolean(imageDataUrl));
  return sparkJson<Plan>({
    model: models.planner(),
    system: buildSystemPrompt(products, customers, profile),
    text: message || "(mensaje sin texto, solo foto)",
    images: imageDataUrl ? [imageDataUrl] : [],
    schemaName: "socio_plan",
    schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
  });
}
