import { resetDemo } from "@/lib/connectors/demo";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

// Reinicia el ERP demo y el historial (para grabar el video desde cero). Solo afecta al conector demo.
export async function POST() {
  if ((process.env.SOCIO_CONNECTOR ?? "demo") !== "demo") {
    return Response.json({ error: "Solo disponible con el conector demo" }, { status: 400 });
  }
  await resetDemo();
  await getStore().clear();
  return Response.json({ ok: true });
}
