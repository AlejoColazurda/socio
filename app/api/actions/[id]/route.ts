import { decide } from "@/lib/agent/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { approve } = (await req.json()) as { approve: boolean };
  try {
    return Response.json(await decide(id, Boolean(approve), "panel web"));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
