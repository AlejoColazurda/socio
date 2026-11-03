import { isMock, listModels, models } from "@/lib/meta/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chequea que la clave funcione y que los IDs configurados existan (en #meta hubo 404 por IDs viejos).
export async function GET() {
  const wanted = { planner: models.planner(), verifier: models.verifier(), transcribe: models.transcribe(), sam: models.sam() };
  if (isMock()) return Response.json({ ok: true, mock: true, wanted });
  try {
    const available = await listModels();
    const missing = Object.entries(wanted).filter(([, id]) => !available.includes(id));
    return Response.json({ ok: missing.length === 0, wanted, missing, available }, { status: missing.length ? 500 : 200 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message, wanted }, { status: 500 });
  }
}
