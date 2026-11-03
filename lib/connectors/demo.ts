import { getTemplate } from "../business";
import { getKv } from "../kv";
import type { Customer, Expense, Order, Product, ResolvedAction } from "../types";
import type { Connector } from "./types";

// ERP de demostración. Arranca con la plantilla del rubro elegido (SOCIO_BUSINESS=kiosco |
// distribuidora | ferreteria) y se reinicia con resetDemo() para grabar la demo desde cero.

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// El estado vive en el KV de Socio para que todas las rutas e instancias vean el mismo ERP.
interface DemoState {
  template: string;
  products: Product[];
  customers: Customer[];
  orders: Order[];
  expenses: Expense[];
}
const KEY = "demo-erp";

async function fresh(): Promise<DemoState> {
  const t = await getTemplate();
  return { template: t.profile.id, products: clone(t.products), customers: clone(t.customers), orders: [], expenses: [] };
}

async function load(): Promise<DemoState> {
  const s = await getKv().get<DemoState>(KEY);
  // Si cambió el rubro activo, arrancamos con su plantilla.
  if (!s || s.template !== (await getTemplate()).profile.id) return fresh();
  return { ...s, orders: s.orders ?? [], expenses: s.expenses ?? [] };
}

let chain: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (s: DemoState) => T): Promise<T> {
  const run = chain.then(async () => {
    const s = await load();
    const r = fn(s);
    await getKv().set(KEY, s);
    return r;
  });
  chain = run.catch(() => {});
  return run;
}

export async function resetDemo() {
  await getKv().set(KEY, await fresh());
}

function product(s: DemoState, id: string | null | undefined) {
  const p = s.products.find((x) => x.id === id);
  if (!p) throw new Error(`Producto inexistente: ${id}`);
  return p;
}

/** Cliente existente o cuenta nueva (la verificación ya avisó y el dueño aprobó). */
function customer(s: DemoState, a: ResolvedAction) {
  let c = s.customers.find((x) => x.id === a.customerId);
  if (!c) {
    c = { id: `c-${Date.now()}`, name: a.customerName ?? "Cliente", balance: 0 };
    s.customers.push(c);
  }
  return c;
}

const $ = (n: number) => `$${n.toLocaleString("es-AR")}`;

export const demoConnector: Connector = {
  id: "demo",
  name: "ERP demo",
  capabilities: [
    "inventory.adjust",
    "inventory.count",
    "sale.record",
    "customer.charge",
    "customer.payment",
    "product.price",
    "order.create",
    "expense.record",
    "query.stock",
  ],
  readOnly: false,
  async listProducts() {
    return (await load()).products;
  },
  async getProduct(id) {
    return (await load()).products.find((p) => p.id === id) ?? null;
  },
  async listCustomers() {
    return (await load()).customers;
  },
  async listOrders() {
    return (await load()).orders.slice().reverse();
  },
  async listExpenses() {
    return (await load()).expenses.slice().reverse();
  },
  execute: (a: ResolvedAction) =>
    mutate((s) => {
      switch (a.type) {
        case "inventory.adjust": {
          const p = product(s, a.productId);
          const before = p.stock;
          p.stock += a.units ?? 0;
          return `${p.name}: stock ${before} → ${p.stock}`;
        }
        case "inventory.count": {
          const p = product(s, a.productId);
          p.stock = a.units ?? p.stock;
          return `${p.name}: stock fijado en ${p.stock}`;
        }
        case "sale.record": {
          const p = product(s, a.productId);
          const before = p.stock;
          p.stock -= a.units ?? 0;
          let debt = "";
          if (a.payment === "credit") {
            const c = customer(s, a);
            c.balance += a.total ?? 0;
            debt = `. ${c.name} ahora debe ${$(c.balance)}`;
          }
          return `Venta de ${a.units} × ${p.name} por ${$(a.total ?? 0)}. Stock ${before} → ${p.stock}${debt}`;
        }
        case "customer.charge":
        case "customer.payment": {
          const c = customer(s, a);
          const delta = a.type === "customer.charge" ? a.amount ?? 0 : -(a.amount ?? 0);
          c.balance += delta;
          return `${c.name}: deuda ${$(c.balance - delta)} → ${$(c.balance)}`;
        }
        case "product.price": {
          const p = product(s, a.productId);
          const before = p.price;
          p.price = a.newPrice ?? p.price;
          return `${p.name}: precio ${$(before)} → ${$(p.price)}`;
        }
        case "order.create": {
          const c = customer(s, a);
          const items = a.resolvedItems ?? [];
          // El pedido reserva la mercadería y queda en la cuenta corriente del comercio.
          for (const it of items) product(s, it.productId).stock -= it.units ?? 0;
          c.balance += a.total ?? 0;
          const order: Order = {
            id: `PED-${String(s.orders.length + 1).padStart(4, "0")}`,
            customerId: c.id,
            customerName: c.name,
            items,
            total: a.total ?? 0,
            dueDate: a.dueDate ?? null,
            status: "nuevo",
            createdAt: new Date().toISOString(),
          };
          s.orders.push(order);
          return `${order.id} para ${c.name}: ${items.map((i) => `${i.quantity} × ${i.productName}`).join(", ")} por ${$(order.total)}${order.dueDate ? `, entrega ${order.dueDate}` : ""}`;
        }
        case "expense.record": {
          const e: Expense = {
            id: `G-${String(s.expenses.length + 1).padStart(4, "0")}`,
            concept: a.concept ?? "Gasto",
            amount: a.amount ?? 0,
            supplier: a.customerName ?? null,
            createdAt: new Date().toISOString(),
          };
          s.expenses.push(e);
          return `Gasto ${e.id}: ${e.concept} ${$(e.amount)}`;
        }
        case "query.stock": {
          const p = product(s, a.productId);
          return `${p.name}: quedan ${p.stock} unidades`;
        }
      }
    }),
};
