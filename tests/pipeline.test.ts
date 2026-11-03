import { beforeEach, describe, expect, it } from "vitest";
import { decide, handleMessage } from "@/lib/agent/pipeline";
import { verifyAction } from "@/lib/agent/verify";
import { demoConnector, resetDemo } from "@/lib/connectors/demo";
import { collectSseText, MOCK_SAM_OUTPUT, parseSamOutput } from "@/lib/meta/sam";
import { getStore } from "@/lib/store";

const stockOf = async (id: string) => (await demoConnector.getProduct(id))!.stock;

beforeEach(async () => {
  await resetDemo();
  await getStore().clear();
});

describe("pipeline", () => {
  it("suma stock automáticamente cuando llega mercadería por caja", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "llegaron dos cajas de playadito" });
    expect(actions).toHaveLength(1);
    expect(actions[0].status).toBe("executed");
    expect(actions[0].action.units).toBe(20);
    expect(await stockOf("p-yerba-playadito-1k")).toBe(34);
  });

  it("una venta fiada pide aprobación y recién al confirmar toca el sistema", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "vendí 2 fernet fiado a ruben" });
    expect(actions[0].status).toBe("pending_approval");
    expect(await stockOf("p-fernet-branca-750")).toBe(6);
    const done = await decide(actions[0].id, true, "dueño");
    expect(done.status).toBe("executed");
    expect(await stockOf("p-fernet-branca-750")).toBe(4);
    const ruben = (await demoConnector.listCustomers()).find((c) => c.id === "c-ruben")!;
    expect(ruben.balance).toBe(6400 + 2 * 14500);
  });

  it("bloquea una venta sin stock suficiente", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "vendí 9 fernet" });
    expect(actions[0].status).toBe("blocked");
    expect(actions[0].checks.find((c) => c.id === "stock")?.status).toBe("fail");
  });

  it("rechazar no modifica nada", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "subile la coca grande a 4500" });
    expect(actions[0].status).toBe("pending_approval");
    await decide(actions[0].id, false, "dueño");
    expect((await demoConnector.getProduct("p-coca-225"))!.price).toBe(3900);
  });

  it("es idempotente con el mismo id externo (reintentos de WhatsApp)", async () => {
    const msg = { channel: "whatsapp" as const, from: "549", text: "llegaron dos cajas de playadito", externalId: "wamid.1" };
    await handleMessage(msg);
    await handleMessage(msg);
    expect(await stockOf("p-yerba-playadito-1k")).toBe(34);
  });

  it("un doble toque en Aprobar ejecuta una sola vez", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "vendí 2 fernet fiado a ruben" });
    const [a, b] = await Promise.all([decide(actions[0].id, true, "dueño"), decide(actions[0].id, true, "dueño")]);
    expect([a.status, b.status].filter((s) => s === "executed").length).toBeGreaterThanOrEqual(1);
    expect(await stockOf("p-fernet-branca-750")).toBe(4);
  });

  it("fiado a un cliente sin cuenta: avisa, y al aprobar crea la cuenta con la deuda", async () => {
    const { actions } = await handleMessage({ channel: "web", from: "web", text: "vendí 1 fernet fiado a carlitos" });
    expect(actions[0].checks.find((c) => c.id === "customer")?.status).toBe("warn");
    await decide(actions[0].id, true, "dueño");
    const carlitos = (await demoConnector.listCustomers()).find((c) => c.name === "carlitos");
    expect(carlitos?.balance).toBe(14500);
  });

  it("una foto se cuenta con SAM y pide confirmar el conteo", async () => {
    const { message, actions } = await handleMessage({ channel: "web", from: "web", text: "contame las coca grande", imageDataUrl: "data:image/png;base64,AAAA" });
    expect(message.vision?.count).toBe(3);
    const count = actions.find((a) => a.action.type === "inventory.count")!;
    expect(count.action.units).toBe(3);
    expect(count.status).toBe("pending_approval");
  });
});

describe("verificación", () => {
  const base = { connector: demoConnector, customers: [], message: "llegaron 3 cajas de oreo" };

  it("rechaza IDs de producto que no estaban entre los candidatos", async () => {
    const r = await verifyAction(
      { type: "inventory.adjust", productId: "p-inventado", quantity: 3, unit: "unit", evidence: "llegaron 3 cajas de oreo" },
      { ...base, candidates: await demoConnector.listProducts() },
    );
    expect(r.checks.find((c) => c.id === "product")?.status).toBe("fail");
  });

  it("rechaza acciones sin respaldo literal en el mensaje", async () => {
    const r = await verifyAction(
      { type: "inventory.adjust", productId: "p-galletitas-oreo", quantity: 3, unit: "pack", evidence: "llegaron 30 cajas" },
      { ...base, candidates: await demoConnector.listProducts() },
    );
    expect(r.checks.find((c) => c.id === "evidence")?.status).toBe("fail");
  });
});

describe("SAM 3.1", () => {
  it("cuenta registros por frame aunque los ids sean salteados", () => {
    const frames = parseSamOutput(MOCK_SAM_OUTPUT);
    expect(frames[0].boxes.map((b) => b.id)).toEqual(["0", "1", "3"]);
    expect(frames[0].boxes[2]).toMatchObject({ x1: 250, y2: 392, w: 1024 });
  });

  it("cero coincidencias es salida vacía", () => {
    expect(parseSamOutput("")).toEqual([]);
  });

  it("arma el texto desde el stream SSE", () => {
    const sse = `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"<0f> 0<|box;x1=1;y1=2;x2=3;y2=4|><|mask;data=1,1,~0|>"}\n\nevent: response.completed\ndata: {"type":"response.completed"}\n\n`;
    expect(parseSamOutput(collectSseText(sse))[0].boxes).toHaveLength(1);
  });
});
