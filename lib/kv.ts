import fs from "node:fs";
import path from "node:path";

// Almacenamiento clave-valor para el estado propio de Socio y el ERP demo.
//   memory   → RAM del proceso (tests)
//   file     → .data/<clave>.json (desarrollo local)
//   supabase → tabla socio_kv en un proyecto Supabase PROPIO de Socio (deploy en Vercel, donde
//              varias instancias tienen que ver el mismo estado). Nunca el del cliente.
//
//   create table socio_kv (key text primary key, value jsonb not null, updated_at timestamptz default now());

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

const g = globalThis as unknown as { __socioKv?: Map<string, string> };

const memoryKv: KV = {
  async get(key) {
    g.__socioKv ??= new Map();
    const v = g.__socioKv.get(key);
    return v ? JSON.parse(v) : null;
  },
  async set(key, value) {
    g.__socioKv ??= new Map();
    g.__socioKv.set(key, JSON.stringify(value));
  },
};

const dir = () => process.env.SOCIO_DATA_DIR || path.join(process.cwd(), ".data");

const fileKv: KV = {
  async get(key) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir(), `${key}.json`), "utf8"));
    } catch {
      return null;
    }
  },
  async set(key, value) {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), `${key}.json`), JSON.stringify(value, null, 2));
  },
};

function supabaseKv(): KV {
  const url = (process.env.SOCIO_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SOCIO_SUPABASE_KEY ?? "";
  if (!url || !key) throw new Error("Faltan SOCIO_SUPABASE_URL / SOCIO_SUPABASE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    async get(k) {
      const res = await fetch(`${url}/rest/v1/socio_kv?select=value&key=eq.${encodeURIComponent(k)}`, { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`socio_kv get ${res.status}: ${await res.text()}`);
      const rows = (await res.json()) as { value: unknown }[];
      return (rows[0]?.value ?? null) as never;
    },
    async set(k, value) {
      const res = await fetch(`${url}/rest/v1/socio_kv?on_conflict=key`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ key: k, value, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`socio_kv set ${res.status}: ${await res.text()}`);
    },
  };
}

export function getKv(): KV {
  switch (process.env.SOCIO_STORE ?? "file") {
    case "memory":
      return memoryKv;
    case "supabase":
      return supabaseKv();
    default:
      return fileKv;
  }
}
