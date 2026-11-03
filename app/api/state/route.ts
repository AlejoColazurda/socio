import { getProfile, TEMPLATES } from "@/lib/business";
import { getConnector } from "@/lib/connectors";
import { isMock } from "@/lib/meta/client";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const connector = await getConnector();
  const [recent, products, customers, orders, expenses, profile] = await Promise.all([
    getStore().recent(40),
    connector.listProducts().catch(() => []),
    connector.listCustomers().catch(() => []),
    connector.listOrders?.().catch(() => []) ?? [],
    connector.listExpenses?.().catch(() => []) ?? [],
    getProfile(),
  ]);
  return Response.json({
    connector: { id: connector.id, name: connector.name, readOnly: connector.readOnly, capabilities: connector.capabilities },
    profile,
    templates: Object.values(TEMPLATES).map((t) => ({ id: t.profile.id, name: t.profile.name, rubro: t.profile.rubro })),
    mock: isMock(),
    ...recent,
    products: products.slice(0, 60),
    customers,
    orders: orders.slice(0, 20),
    expenses: expenses.slice(0, 20),
  });
}
