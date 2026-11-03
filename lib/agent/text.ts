import type { Customer, Product } from "../types";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$,. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["de", "la", "el", "los", "las", "un", "una", "y", "con", "del", "al", "en", "kg", "ml", "l", "g", "box"]);

function tokens(s: string) {
  return normalize(s)
    .replace(/[,.$]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Puntaje simple: alias completo en el mensaje pesa más que tokens sueltos. */
export function scoreProduct(p: Product, message: string): number {
  const msg = ` ${normalize(message).replace(/[,.$]/g, " ")} `;
  const msgTokens = new Set(tokens(message));
  let score = 0;
  for (const alias of [p.name, p.brand ?? "", ...(p.aliases ?? [])]) {
    const a = normalize(alias);
    if (a && msg.includes(` ${a} `)) score += 3 + a.split(" ").length;
  }
  for (const t of tokens(`${p.name} ${p.brand ?? ""} ${(p.aliases ?? []).join(" ")}`)) {
    if (msgTokens.has(t)) score += 1;
  }
  return score;
}

/**
 * Productos candidatos para el planificador. El modelo solo puede referenciar IDs de esta lista,
 * y la verificación rechaza cualquier otro: así un ID inventado nunca llega al sistema.
 */
export function candidateProducts(catalog: Product[], message: string, max = 25): Product[] {
  if (catalog.length <= max) return catalog;
  return catalog
    .map((p) => ({ p, s: scoreProduct(p, message) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.p);
}

export function findCustomer(customers: Customer[], name: string | null | undefined): Customer | null {
  if (!name) return null;
  const q = tokens(name);
  let best: { c: Customer; s: number } | null = null;
  for (const c of customers) {
    const ct = new Set(tokens(c.name));
    const s = q.filter((t) => ct.has(t)).length;
    if (s > 0 && (!best || s > best.s)) best = { c, s };
  }
  return best?.c ?? null;
}

/** ¿El fragmento citado aparece en el mensaje? Tolera mayúsculas, tildes y puntuación. */
export function evidenceInMessage(evidence: string, message: string): boolean {
  const e = normalize(evidence).replace(/[,.]/g, "");
  const m = normalize(message).replace(/[,.]/g, "");
  return e.length >= 3 && m.includes(e);
}

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
