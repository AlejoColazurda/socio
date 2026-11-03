import type { ActionType, Customer, Product, ResolvedAction } from "../types";
import type { Connector } from "./types";

// Conector genérico: cualquier ERP, CRM o SaaS que exponga estos endpoints queda enchufado a Socio.
//
//   GET  {REST_BASE_URL}/socio/capabilities  -> { capabilities: ActionType[] }
//   GET  {REST_BASE_URL}/socio/products      -> Product[]
//   GET  {REST_BASE_URL}/socio/customers     -> Customer[]
//   POST {REST_BASE_URL}/socio/actions       -> body: ResolvedAction, respuesta: { result: string }
//
// Autenticación: Authorization: Bearer {REST_TOKEN}. Un adaptador fino del lado del sistema
// (o un flujo de n8n/Zapier) traduce esto a su API propia.

function cfg() {
  const base = process.env.REST_BASE_URL;
  if (!base) throw new Error("Falta REST_BASE_URL");
  return { base: base.replace(/\/$/, ""), token: process.env.REST_TOKEN ?? "" };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { base, token } = cfg();
  const res = await fetch(`${base}/socio/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`REST ${path} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

let capabilities: ActionType[] = ["query.stock"];

export async function loadRestCapabilities() {
  const r = await call<{ capabilities: ActionType[] }>("capabilities");
  capabilities = r.capabilities;
}

export const restConnector: Connector = {
  id: "rest",
  name: "Sistema conectado por API",
  get capabilities() {
    return capabilities;
  },
  readOnly: false,
  listProducts: () => call<Product[]>("products"),
  async getProduct(id) {
    const all = await call<Product[]>("products");
    return all.find((p) => p.id === id) ?? null;
  },
  listCustomers: () => call<Customer[]>("customers"),
  async execute(a: ResolvedAction) {
    const r = await call<{ result: string }>("actions", { method: "POST", body: JSON.stringify(a) });
    return r.result;
  },
};
