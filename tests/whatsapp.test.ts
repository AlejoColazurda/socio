import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { argentineVariants, extractMessages, isOwner, verifySignature } from "@/lib/channels/whatsapp";

afterEach(() => {
  delete process.env.SOCIO_OWNER_NUMBERS;
  delete process.env.WHATSAPP_APP_SECRET;
});

describe("WhatsApp", () => {
  it("reconoce las dos formas de un celular argentino", () => {
    expect(argentineVariants("5491122334455")).toEqual(["5491122334455", "541122334455"]);
    expect(argentineVariants("541122334455")).toEqual(["541122334455", "5491122334455"]);
    expect(argentineVariants("14155550100")).toEqual(["14155550100"]);
  });

  it("autoriza al dueño aunque lo hayan cargado sin el 9", () => {
    process.env.SOCIO_OWNER_NUMBERS = "541122334455";
    expect(isOwner("5491122334455")).toBe(true);
    expect(isOwner("5491199999999")).toBe(false);
  });

  it("valida la firma del webhook con el secreto de la app", () => {
    process.env.WHATSAPP_APP_SECRET = "secreto-de-prueba";
    const body = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "secreto-de-prueba").update(body).digest("hex");
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(body, "sha256=" + "0".repeat(64))).toBe(false);
  });

  it("extrae texto, audio y botones del payload del webhook", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "5491122334455", type: "text", text: { body: "llegaron 2 cajas" } },
                  { id: "wamid.2", from: "5491122334455", type: "audio", audio: { id: "media-1" } },
                  { id: "wamid.3", from: "5491122334455", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ok:abc", title: "Sí, cargalo" } } },
                ],
              },
            },
          ],
        },
      ],
    };
    const msgs = extractMessages(payload);
    expect(msgs.map((m) => m.type)).toEqual(["text", "audio", "interactive"]);
    expect(msgs[2].interactive?.button_reply?.id).toBe("ok:abc");
  });
});
