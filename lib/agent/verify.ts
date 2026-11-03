import type { Connector } from "../connectors/types";
import type { Check, Customer, Product, ProposedAction, ResolvedAction, Risk } from "../types";
import { evidenceInMessage, findCustomer, pesos } from "./text";

const PRODUCT_ACTIONS = new Set(["inventory.adjust", "inventory.count", "sale.record", "product.price", "query.stock"]);
const CUSTOMER_ACTIONS = new Set(["customer.charge", "customer.payment"]);

export interface VerifyContext {
  connector: Connector;
  message: string;
  candidates: Product[];
  customers: Customer[];
  /** true si la cantidad vino de contar una foto con SAM (no hay frase literal que citar). */
  fromVision?: boolean;
}

export interface Verified {
  action: ResolvedAction;
  checks: Check[];
}

/**
 * Verificación determinística: el modelo propone, el código decide si la propuesta es coherente
 * con el mensaje, el catálogo, el stock y lo que el sistema conectado sabe hacer.
 */
export async function verifyAction(p: ProposedAction, ctx: VerifyContext): Promise<Verified> {
  const checks: Check[] = [];
  const pass = (id: string, message: string) => checks.push({ id, status: "pass", message });
  const warn = (id: string, message: string) => checks.push({ id, status: "warn", message });
  const fail = (id: string, message: string) => checks.push({ id, status: "fail", message });
  const a: ResolvedAction = { ...p };

  if (ctx.connector.capabilities.includes(p.type)) pass("capability", `${ctx.connector.name} soporta esta acción`);
  else fail("capability", `${ctx.connector.name} no soporta "${p.type}"`);

  if (ctx.fromVision) pass("evidence", "Cantidad obtenida del conteo de la foto");
  else if (evidenceInMessage(p.evidence ?? "", ctx.message)) pass("evidence", `Respaldado por: "${p.evidence}"`);
  else fail("evidence", "La acción no aparece literalmente en el mensaje");

  let product: Product | null = null;
  if (PRODUCT_ACTIONS.has(p.type)) {
    const inCandidates = ctx.candidates.some((c) => c.id === p.productId);
    product = p.productId && inCandidates ? await ctx.connector.getProduct(p.productId) : null;
    if (!product) {
      fail("product", p.productId ? `Producto "${p.productId}" no está en el catálogo` : "No se identificó el producto");
    } else {
      pass("product", `Producto: ${product.name}`);
      a.productName = product.name;
      a.stockBefore = product.stock;
    }
  }

  if (product && ["inventory.adjust", "inventory.count", "sale.record"].includes(p.type)) {
    const q = p.quantity;
    if (q === null || q === undefined || !Number.isFinite(q) || !Number.isInteger(q)) {
      fail("quantity", "Falta una cantidad entera");
    } else if (p.type !== "inventory.adjust" && q < 0) {
      fail("quantity", "La cantidad no puede ser negativa");
    } else if (p.type === "inventory.adjust" && q === 0) {
      fail("quantity", "La cantidad no puede ser cero");
    } else {
      let units = q;
      if (p.unit === "pack") {
        if (!product.unitsPerPack) fail("pack", `No sé cuántas unidades trae una caja de ${product.name}`);
        else {
          units = q * product.unitsPerPack;
          pass("pack", `${Math.abs(q)} caja(s) × ${product.unitsPerPack} = ${Math.abs(units)} unidades`);
        }
      }
      a.units = units;
      const after = p.type === "inventory.count" ? units : p.type === "sale.record" ? product.stock - units : product.stock + units;
      a.stockAfter = after;
      if (after < 0) fail("stock", `Stock insuficiente: hay ${product.stock} y quedaría en ${after}`);
      else pass("stock", `Stock ${product.stock} → ${after}`);
      if (Math.abs(units) > 500) warn("magnitude", `Cantidad inusual: ${units} unidades`);
      if (p.type === "inventory.count" && Math.abs(after - product.stock) > Math.max(5, product.stock * 0.3)) {
        warn("count-diff", `El conteo difiere mucho del sistema (${product.stock})`);
      }
    }
  }

  if (product && p.type === "sale.record" && a.units !== undefined) {
    const unitPrice = p.unitPrice ?? product.price;
    if (p.unitPrice && Math.abs(p.unitPrice - product.price) / product.price > 0.2) {
      warn("price", `Precio dicho ${pesos(p.unitPrice)} vs lista ${pesos(product.price)}`);
    }
    a.unitPrice = unitPrice;
    a.total = unitPrice * a.units;
    pass("total", `${a.units} × ${pesos(unitPrice)} = ${pesos(a.total)}`);
  }

  if (product && p.type === "product.price") {
    const np = p.newPrice;
    if (!np || np <= 0) fail("price", "Falta el precio nuevo");
    else {
      const change = (np - product.price) / product.price;
      if (Math.abs(change) > 0.4) warn("price-jump", `Cambio de ${Math.round(change * 100)}% (${pesos(product.price)} → ${pesos(np)})`);
      else pass("price", `${pesos(product.price)} → ${pesos(np)} (${change >= 0 ? "+" : ""}${Math.round(change * 100)}%)`);
    }
  }

  const needsCustomer = CUSTOMER_ACTIONS.has(p.type) || (p.type === "sale.record" && p.payment === "credit");
  if (needsCustomer) {
    if (!p.customerName) fail("customer", "Falta a qué cliente anotarlo");
    else {
      const c = findCustomer(ctx.customers, p.customerName);
      if (c) {
        a.customerId = c.id;
        a.customerName = c.name;
        pass("customer", `Cliente: ${c.name} (debe ${pesos(c.balance)})`);
        if (p.type === "customer.payment" && (p.amount ?? 0) > c.balance) {
          warn("overpay", `Paga ${pesos(p.amount ?? 0)} pero debe ${pesos(c.balance)}`);
        }
      } else {
        a.customerIsNew = true;
        warn("customer", `"${p.customerName}" no tiene cuenta: se crearía una nueva`);
      }
    }
  }
  if (CUSTOMER_ACTIONS.has(p.type)) {
    if (!p.amount || p.amount <= 0) fail("amount", "Falta el monto");
    else pass("amount", `Monto ${pesos(p.amount)}`);
  }

  if (ctx.connector.readOnly && p.type !== "query.stock") warn("read-only", "El sistema está en solo lectura: se simula");

  return { action: a, checks };
}

export function riskOf(a: ResolvedAction, checks: Check[]): Risk {
  if (checks.some((c) => c.status === "fail")) return "blocked";
  if (a.type === "query.stock") return "auto";
  if (checks.some((c) => c.status === "warn")) return "approval";
  const autoLimit = Number(process.env.SOCIO_AUTO_LIMIT ?? 20000);
  // Lo que suma stock o es una venta chica en efectivo pasa solo; tocar plata ajena, precios
  // o bajar stock siempre pide confirmación del dueño.
  if (a.type === "inventory.adjust" && (a.units ?? 0) > 0) return "auto";
  if (a.type === "sale.record" && a.payment !== "credit" && (a.total ?? 0) <= autoLimit) return "auto";
  return "approval";
}
