import type { Product, ResolvedAction } from "../types";
import type { Connector } from "./types";

// Conector para el Maxikiosco 24/7 (Supabase, tabla mk_products).
// Por seguridad arranca en solo lectura: las escrituras se simulan salvo MK247_ALLOW_WRITES=1.
// El sistema no tiene cuentas corrientes, así que fiado y pagos no están en capabilities.

interface MkRow {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  stock: number;
  active: boolean;
}

function env() {
  const url = process.env.MK247_SUPABASE_URL;
  const key = process.env.MK247_SUPABASE_KEY;
  if (!url || !key) throw new Error("Faltan MK247_SUPABASE_URL / MK247_SUPABASE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`mk247 ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const toProduct = (r: MkRow): Product => ({
  id: r.id,
  name: r.name,
  brand: r.brand ?? undefined,
  price: r.price,
  stock: r.stock,
});

const allowWrites = () => process.env.MK247_ALLOW_WRITES === "1";

export const mk247Connector: Connector = {
  id: "mk247",
  name: "Maxikiosco 24/7",
  capabilities: ["inventory.adjust", "inventory.count", "product.price", "query.stock"],
  get readOnly() {
    return !allowWrites();
  },
  async listProducts() {
    const rows = await rest<MkRow[]>("mk_products?select=id,name,brand,price,stock,active&active=eq.true&limit=2000");
    return rows.map(toProduct);
  },
  async getProduct(id) {
    const rows = await rest<MkRow[]>(`mk_products?select=id,name,brand,price,stock,active&id=eq.${encodeURIComponent(id)}`);
    return rows[0] ? toProduct(rows[0]) : null;
  },
  async listCustomers() {
    return [];
  },
  async execute(a: ResolvedAction) {
    if (a.type === "query.stock") {
      const p = await this.getProduct(a.productId!);
      return `${p?.name}: quedan ${p?.stock} unidades`;
    }
    let patch: Partial<MkRow>;
    let desc: string;
    if (a.type === "inventory.adjust" || a.type === "inventory.count") {
      patch = { stock: a.stockAfter };
      desc = `${a.productName}: stock ${a.stockBefore} → ${a.stockAfter}`;
    } else if (a.type === "product.price") {
      patch = { price: a.newPrice ?? undefined };
      desc = `${a.productName}: precio → $${(a.newPrice ?? 0).toLocaleString("es-AR")}`;
    } else {
      throw new Error(`mk247 no soporta ${a.type}`);
    }
    if (!allowWrites()) return `[simulado, solo lectura] ${desc}`;
    await rest(`mk_products?id=eq.${encodeURIComponent(a.productId!)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return desc;
  },
};
