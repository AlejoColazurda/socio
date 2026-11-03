import type { Customer, Product, ResolvedAction } from "../types";
import type { Connector } from "./types";

// ERP de demostración con un catálogo típico de maxikiosco argentino.
// Persiste en memoria del proceso; para la demo se reinicia con reset().

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

// En globalThis para que todas las rutas de Next compartan el mismo ERP dentro del proceso.
const g = globalThis as unknown as { __socioDemo?: { products: Product[]; customers: Customer[] } };
g.__socioDemo ??= { products: clone(SEED_PRODUCTS), customers: clone(SEED_CUSTOMERS) };
const state = g.__socioDemo;

export function resetDemo() {
  state.products = clone(SEED_PRODUCTS);
  state.customers = clone(SEED_CUSTOMERS);
}

function product(id: string | null | undefined) {
  const p = state.products.find((x) => x.id === id);
  if (!p) throw new Error(`Producto inexistente: ${id}`);
  return p;
}

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
    return clone(state.products);
  },
  async getProduct(id) {
    return clone(state.products.find((p) => p.id === id) ?? null);
  },
  async listCustomers() {
    return clone(state.customers);
  },
  async execute(a: ResolvedAction) {
    switch (a.type) {
      case "inventory.adjust": {
        const p = product(a.productId);
        p.stock += a.units ?? 0;
        return `${p.name}: stock ${a.stockBefore} → ${p.stock}`;
      }
      case "inventory.count": {
        const p = product(a.productId);
        p.stock = a.units ?? p.stock;
        return `${p.name}: stock fijado en ${p.stock}`;
      }
      case "sale.record": {
        const p = product(a.productId);
        p.stock -= a.units ?? 0;
        let debt = "";
        if (a.payment === "credit" && a.customerId) {
          const c = state.customers.find((x) => x.id === a.customerId);
          if (c) {
            c.balance += a.total ?? 0;
            debt = `. ${c.name} ahora debe $${c.balance.toLocaleString("es-AR")}`;
          }
        }
        return `Venta de ${a.units} × ${p.name} por $${(a.total ?? 0).toLocaleString("es-AR")}. Stock ${a.stockBefore} → ${p.stock}${debt}`;
      }
      case "customer.charge":
      case "customer.payment": {
        let c = state.customers.find((x) => x.id === a.customerId);
        if (!c) {
          c = { id: `c-${Date.now()}`, name: a.customerName ?? "Cliente", balance: 0 };
          state.customers.push(c);
        }
        const delta = a.type === "customer.charge" ? a.amount ?? 0 : -(a.amount ?? 0);
        c.balance += delta;
        return `${c.name}: deuda $${(c.balance - delta).toLocaleString("es-AR")} → $${c.balance.toLocaleString("es-AR")}`;
      }
      case "product.price": {
        const p = product(a.productId);
        const before = p.price;
        p.price = a.newPrice ?? p.price;
        return `${p.name}: precio $${before.toLocaleString("es-AR")} → $${p.price.toLocaleString("es-AR")}`;
      }
      case "query.stock": {
        const p = product(a.productId);
        return `${p.name}: quedan ${p.stock} unidades`;
      }
    }
  },
};
