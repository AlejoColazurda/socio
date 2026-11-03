import type { Customer, Product, ProposedAction } from "../types";
import type { Plan } from "./planner";
import { findCustomer, normalize, scoreProduct } from "./text";

// Planificador determinístico para SOCIO_MOCK=1: permite desarrollar y testear todo el circuito
// sin clave de Meta. No pretende entender todo; cubre los casos del demo.

const WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, veinte: 20,
};

function num(s: string): number | null {
  const t = s.replace(/\./g, "").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return WORDS[s] ?? null;
}

function money(clause: string): number | null {
  const lucas = clause.match(/(\d+(?:[.,]\d+)?)\s*(?:lucas?|mil)\b/);
  if (lucas) return Math.round(Number(lucas[1].replace(",", ".")) * 1000);
  const m = clause.match(/\$\s*([\d.]+)|([\d.]{3,})\s*(?:pesos|mangos)?/);
  if (m) return Number((m[1] ?? m[2]).replace(/\./g, ""));
  return null;
}

function bestProduct(products: Product[], clause: string): Product | null {
  let best: { p: Product; s: number } | null = null;
  for (const p of products) {
    const s = scoreProduct(p, clause);
    if (s > 0 && (!best || s > best.s)) best = { p, s };
  }
  return best?.p ?? null;
}

export function mockPlan(message: string, products: Product[], customers: Customer[], hasImage: boolean): Plan {
  const actions: ProposedAction[] = [];
  const raw = message.trim();
  const clauses = raw.split(/\s*(?:,|\by\b|\.)\s*(?=llegaron|llego|llegó|vendi|vendí|anotale|anota|fiado|pago|pagó|pagué|subi|subile|cambia|cuant|se rompi|se vencieron)/i);

  for (const clauseRaw of clauses) {
    const clause = normalize(clauseRaw);
    const p = bestProduct(products, clause);
    const qtyMatch = clause.match(/\b(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|veinte)\b/);
    const qty = qtyMatch ? num(qtyMatch[1]) : null;
    // "bulto" solo se convierte si el catálogo dice cuántas unidades trae; si no, el artículo ya es el bulto.
    const pack = /\b(caja|cajas|bulto|bultos|pack|packs|fardo|fardos|cajon|cajones)\b/.test(clause) && Boolean(p?.unitsPerPack);
    const base: Omit<ProposedAction, "type"> = {
      productId: p?.id ?? null, quantity: qty, unit: pack ? "pack" : "unit", unitPrice: null, newPrice: null,
      customerName: null, amount: null, payment: null, items: null, concept: null, dueDate: null, evidence: clauseRaw.trim(),
    };
    const noProduct = { productId: null, quantity: null, unit: null } as const;

    if (/\b(pide|pidio|encargo|me encargo)\b/.test(clause)) {
      const who = clause.match(/^(?:el\s+|la\s+)?(.+?)\s+(?:me\s+)?(?:pide|pidio|encargo)/);
      const c = findCustomer(customers, who?.[1]);
      const due = clause.match(/para (?:el |la )?([a-z0-9/]+)/);
      actions.push({
        ...base, ...noProduct, type: "order.create", customerName: c?.name ?? who?.[1] ?? null,
        items: [{ productId: p?.id ?? null, quantity: qty, unit: pack ? "pack" : "unit" }], dueDate: due?.[1] ?? null,
      });
    } else if (/^pague\b/.test(clause)) {
      const concept = clause.match(/\bde\s+([a-z ]+)$/)?.[1]?.trim() ?? null;
      actions.push({ ...base, ...noProduct, type: "expense.record", amount: money(clause), concept });
    } else if (/^(llegaron|llego|entraron|me trajeron)/.test(clause)) {
      actions.push({ ...base, type: "inventory.adjust" });
    } else if (/se (rompi|vencieron|vencio)/.test(clause)) {
      actions.push({ ...base, type: "inventory.adjust", quantity: -(qty ?? 1) });
    } else if (/^vendi/.test(clause)) {
      const fiado = /fiado|a cuenta/.test(clause);
      const who = clause.match(/(?:a|al|para)\s+(?:la\s+|el\s+)?([a-z]+)\s*$/);
      actions.push({ ...base, type: "sale.record", payment: fiado ? "credit" : "cash", customerName: fiado ? who?.[1] ?? null : null });
    } else if (/fiado|anotale|anota/.test(clause)) {
      const who = clause.match(/(?:a|al)\s+(?:la\s+|el\s+)?([a-z]+)/);
      const c = findCustomer(customers, who?.[1]);
      actions.push({ ...base, type: "customer.charge", productId: null, quantity: null, unit: null, amount: money(clause), customerName: c?.name ?? who?.[1] ?? null });
    } else if (/pago|pag|transfiri/.test(clause)) {
      const who = clause.match(/^(?:el\s+|la\s+)?([a-z]+)\s+(?:me\s+)?(?:pag|transfiri)/) ?? clause.match(/pag[a-z]*\s+(?:el\s+|la\s+)?([a-z]+)/);
      const c = findCustomer(customers, who?.[1]);
      actions.push({ ...base, type: "customer.payment", productId: null, quantity: null, unit: null, amount: money(clause), customerName: c?.name ?? who?.[1] ?? null });
    } else if (/subi|subile|cambia|precio/.test(clause)) {
      actions.push({ ...base, type: "product.price", quantity: null, unit: null, newPrice: money(clause.replace(/^.*?\ba\b/, "")) });
    } else if (/cuant/.test(clause)) {
      actions.push({ ...base, type: "query.stock", quantity: null, unit: null });
    }
  }

  const vision = hasImage ? { nounPhrase: "bottle", productId: bestProduct(products, normalize(raw))?.id ?? null } : null;
  if (vision) {
    actions.push({
      type: "inventory.count", productId: vision.productId, quantity: null, unit: "unit", unitPrice: null, newPrice: null,
      customerName: null, amount: null, payment: null, evidence: raw || "foto",
    });
  }

  const noProductTypes = new Set(["customer.charge", "customer.payment", "expense.record", "order.create"]);
  const missing =
    actions.some((a) => !noProductTypes.has(a.type) && !a.productId) ||
    actions.some((a) => a.type === "order.create" && a.items?.some((i) => !i.productId));
  return {
    summary: actions.length ? `Entendí ${actions.length} cosa(s) para hacer.` : "No encontré nada para hacer.",
    actions,
    clarification: missing ? "¿De qué producto me hablás?" : actions.length ? null : "¿Qué querés que anote?",
    vision,
  };
}
