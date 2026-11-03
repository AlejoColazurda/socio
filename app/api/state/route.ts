import { getConnector } from "@/lib/connectors";
import { isMock } from "@/lib/meta/client";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const connector = await getConnector();
  const [recent, products, customers] = await Promise.all([
    getStore().recent(40),
    connector.listProducts().catch(() => []),
    connector.listCustomers().catch(() => []),
  ]);
  return Response.json({
    connector: { id: connector.id, name: connector.name, readOnly: connector.readOnly, capabilities: connector.capabilities },
    mock: isMock(),
    ...recent,
    products: products.slice(0, 60),
    customers,
  });
}
