import type { Customer, Product, ResolvedAction } from "../types";
import { getKv } from "../kv";
import type { Connector } from "./types";

// ERP de demostración con un catálogo típico de maxikiosco argentino.
// Se reinicia con resetDemo() para grabar la demo desde cero.

const SEED_PRODUCTS: Product[] = [
  { id: "p-yerba-playadito-1k", name: "Yerba Playadito 1 kg", brand: "Playadito", price: 5200, stock: 14, unitsPerPack: 10, aliases: ["playadito", "yerba playadito"] },
  { id: "p-yerba-taragui-1k", name: "Yerba Taragüi 1 kg", brand: "Taragüi", price: 4800, stock: 9, unitsPerPack: 10, aliases: ["taragui", "taragüi"] },
  { id: "p-coca-225", name: "Coca-Cola 2,25 L", brand: "Coca-Cola", price: 3900, stock: 24, unitsPerPack: 6, aliases: ["coca", "coca cola", "coca grande", "coca de dos y cuarto"] },
  { id: "p-coca-500", name: "Coca-Cola 500 ml", brand: "Coca-Cola", price: 1600, stock: 40, unitsPerPack: 12, aliases: ["coca chica", "coquita"] },
  { id: "p-cindor-1l", name: "Leche chocolatada Cindor 1 L", brand: "Cindor", price: 2900, stock: 12, unitsPerPack: 12, aliases: ["cindor"] },
  { id: "p-leche-serenisima-1l", name: "Leche La Serenísima 1 L", brand: "La Serenísima", price: 1700, stock: 18, unitsPerPack: 12, aliases: ["leche", "serenisima", "la serenisima"] },
  { id: "p-alfajor-guaymallen", name: "Alfajor Guaymallén", brand: "Guaymallén", price: 450, stock: 60, unitsPerPack: 40, aliases: ["guaymallen", "alfajor"] },
  { id: "p-alfajor-jorgito", name: "Alfajor Jorgito", brand: "Jorgito", price: 700, stock: 36, unitsPerPack: 24, aliases: ["jorgito"] },
  { id: "p-galletitas-oreo", name: "Galletitas Oreo 118 g", brand: "Oreo", price: 1500, stock: 20, unitsPerPack: 24, aliases: ["oreo"] },
  { id: "p-fernet-branca-750", name: "Fernet Branca 750 ml", brand: "Branca", price: 14500, stock: 6, unitsPerPack: 6, aliases: ["fernet", "branca"] },
  { id: "p-cerveza-quilmes-1l", name: "Cerveza Quilmes 1 L", brand: "Quilmes", price: 2600, stock: 30, unitsPerPack: 12, aliases: ["quilmes", "birra", "cerveza"] },
  { id: "p-pan-lactal-bimbo", name: "Pan lactal Bimbo", brand: "Bimbo", price: 3100, stock: 8, aliases: ["pan lactal", "bimbo"] },
  { id: "p-cigarrillos-marlboro", name: "Marlboro box 20", brand: "Marlboro", price: 4200, stock: 50, unitsPerPack: 10, aliases: ["marlboro", "puchos"] },
  { id: "p-agua-villavicencio-2l", name: "Agua Villavicencio 2 L", brand: "Villavicencio", price: 1400, stock: 22, unitsPerPack: 6, aliases: ["agua", "villavicencio"] },
  { id: "p-azucar-ledesma-1k", name: "Azúcar Ledesma 1 kg", brand: "Ledesma", price: 1300, stock: 15, unitsPerPack: 10, aliases: ["azucar", "ledesma"] },
];

const SEED_CUSTOMERS: Customer[] = [
  { id: "c-ruben", name: "Rubén (el de la esquina)", phone: "", balance: 6400 },
  { id: "c-marta", name: "Marta Gómez", phone: "", balance: 0 },
  { id: "c-taller", name: "Taller Los Pibes", phone: "", balance: 18200 },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// El estado vive en el KV de Socio para que todas las rutas e instancias vean el mismo ERP.
interface DemoState {
  products: Product[];
  customers: Customer[];
}
const KEY = "demo-erp";
const fresh = (): DemoState => ({ products: clone(SEED_PRODUCTS), customers: clone(SEED_CUSTOMERS) });
const load = async () => (await getKv().get<DemoState>(KEY)) ?? fresh();

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
  await getKv().set(KEY, fresh());
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
  name: "ERP demo (Maxikiosco)",
  capabilities: [
    "inventory.adjust",
    "inventory.count",
    "sale.record",
    "customer.charge",
    "customer.payment",
    "product.price",
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
        case "query.stock": {
          const p = product(s, a.productId);
          return `${p.name}: quedan ${p.stock} unidades`;
        }
      }
    }),
};
