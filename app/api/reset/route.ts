import { setTemplate } from "@/lib/business";
import { resetDemo } from "@/lib/connectors/demo";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

// Reinicia el ERP demo y el historial, opcionalmente con otro rubro (kiosco, distribuidora, ferreteria).
// Solo afecta al conector demo.
export async function POST(req: Request) {
  if ((process.env.SOCIO_CONNECTOR ?? "demo") !== "demo") {
    return Response.json({ error: "Solo disponible con el conector demo" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { template?: string };
  try {
    if (body.template) await setTemplate(body.template);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  await resetDemo();
  await getStore().clear();
  return Response.json({ ok: true });
}
