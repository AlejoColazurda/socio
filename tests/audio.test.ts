import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { toWav16k } from "@/lib/audio";

describe("audio", () => {
  it("convierte una nota de voz OGG/Opus a WAV mono 16 kHz con encabezado válido", async () => {
    // 1 s de tono en OGG/Opus, como las notas de voz de WhatsApp.
    const ogg = spawnSync(ffmpegPath!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", "-f", "ogg", "pipe:1"]).stdout;
    const wav = Buffer.from(await toWav16k(new Uint8Array(ogg)));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16); // bits
    const dataAt = wav.indexOf("data");
    expect(wav.readUInt32LE(dataAt + 4)).toBe(wav.length - dataAt - 8);
  });
});
