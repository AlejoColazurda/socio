// Vocabulario común de Socio. Cualquier ERP, CRM o SaaS se conecta implementando
// un Connector que entiende estas acciones (o declara que no las soporta).

export type ActionType =
  | "inventory.adjust" // llegó mercadería, rotura, vencimiento: suma o resta stock
  | "inventory.count" // conteo físico: fija el stock en un valor
  | "sale.record" // venta de mostrador
  | "customer.charge" // fiado: suma deuda a un cliente
  | "customer.payment" // el cliente paga parte o toda su deuda
  | "product.price" // cambio de precio
  | "order.create" // pedido de un cliente para preparar/entregar (distribuidoras, mayoristas)
  | "expense.record" // gasto o pago a proveedor (luz, combustible, mercadería)
  | "query.stock"; // consulta, no modifica nada

export const ACTION_LABELS: Record<ActionType, string> = {
  "inventory.adjust": "Ajuste de stock",
  "inventory.count": "Conteo de stock",
  "sale.record": "Venta",
  "customer.charge": "Cuenta corriente (fiado)",
  "customer.payment": "Cobro a cliente",
  "product.price": "Cambio de precio",
  "order.create": "Pedido",
  "expense.record": "Gasto",
  "query.stock": "Consulta de stock",
};

export interface OrderItem {
  productId: string | null;
  quantity: number | null;
  unit: "unit" | "pack" | null;
}

export interface ResolvedOrderItem extends OrderItem {
  productName?: string;
  units?: number;
  unitPrice?: number;
  subtotal?: number;
}

export interface Order {
  id: string;
  customerId?: string;
  customerName: string;
  items: ResolvedOrderItem[];
  total: number;
  dueDate?: string | null;
  status: "nuevo" | "preparado" | "entregado";
  createdAt: string;
}

export interface Expense {
  id: string;
  concept: string;
  amount: number;
  supplier?: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  price: number; // en pesos, entero
  stock: number;
  unitsPerPack?: number; // cuántas unidades trae una caja/bulto
  aliases?: string[];
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  balance: number; // deuda en pesos (positiva = nos debe)
}

/** Lo que el modelo propone. Todo lo que referencia datos pasa por verificación en código. */
export interface ProposedAction {
  type: ActionType;
  productId?: string | null;
  quantity?: number | null; // en la unidad indicada
  unit?: "unit" | "pack" | null;
  unitPrice?: number | null;
  newPrice?: number | null;
  customerName?: string | null;
  amount?: number | null;
  payment?: "cash" | "transfer" | "credit" | null;
  /** Renglones de un pedido (order.create). */
  items?: OrderItem[] | null;
  /** Concepto de un gasto (expense.record): "luz", "combustible", "proveedor de bebidas". */
  concept?: string | null;
  /** Fecha de entrega pedida, tal como la dijo ("jueves", "mañana", "15/11"). */
  dueDate?: string | null;
  /** Fragmento literal del mensaje que justifica la acción. Se valida contra el transcript. */
  evidence: string;
}

/** Acción ya resuelta a valores concretos del sistema conectado. */
export interface ResolvedAction extends ProposedAction {
  units?: number; // cantidad final en unidades
  productName?: string;
  stockBefore?: number;
  stockAfter?: number;
  customerId?: string;
  customerIsNew?: boolean;
  total?: number;
  resolvedItems?: ResolvedOrderItem[];
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface Check {
  id: string;
  status: CheckStatus;
  message: string;
}

export type Risk = "auto" | "approval" | "blocked";

export type ActionStatus =
  | "pending_approval"
  | "processing"
  | "executed"
  | "rejected"
  | "blocked"
  | "failed"
  | "answered";

export interface ActionRecord {
  id: string;
  messageId: string;
  action: ResolvedAction;
  checks: Check[];
  risk: Risk;
  status: ActionStatus;
  result?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export type Channel = "web" | "whatsapp";

export interface InboundMessage {
  channel: Channel;
  from: string; // número o "web"
  text?: string;
  audioWav?: Uint8Array; // ya convertido a WAV mono 16/24 kHz
  imageDataUrl?: string;
  externalId?: string; // id de WhatsApp, para idempotencia
}

export interface MessageRecord {
  id: string;
  channel: Channel;
  from: string;
  externalId?: string;
  text?: string;
  transcript: string; // texto final que vio el planificador (texto + audio transcripto)
  hadAudio: boolean;
  hadImage: boolean;
  vision?: { prompt: string; count: number; boxes: number[][] } | null;
  summary: string;
  reply: string;
  clarification?: string | null;
  actionIds: string[];
  createdAt: string;
  timings: Record<string, number>;
  error?: string;
}
