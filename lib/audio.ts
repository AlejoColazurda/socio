import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * ffmpeg escribiendo a un pipe no puede volver al principio, así que deja los tamaños del
 * encabezado RIFF/data en 0xFFFFFFFF. Los corregimos para que el WAV sea válido.
 */
export function fixWavSizes(buf: Buffer): Uint8Array {
  if (buf.toString("ascii", 0, 4) !== "RIFF") return new Uint8Array(buf);
  buf.writeUInt32LE(buf.length - 8, 4);
  for (let off = 12; off + 8 <= buf.length; ) {
    const id = buf.toString("ascii", off, off + 4);
    if (id === "data") {
      buf.writeUInt32LE(buf.length - off - 8, off + 4);
      break;
    }
    off += 8 + buf.readUInt32LE(off + 4);
  }
  return new Uint8Array(buf);
}

/**
 * Convierte cualquier audio (las notas de voz de WhatsApp llegan en OGG/Opus) a WAV mono
 * PCM 16 bit a 16 kHz, que es lo que acepta Muse Voice Transcribe.
 */
export function toWav16k(input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg-static no disponible en esta plataforma"));
    const ff = spawn(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
      "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-map_metadata", "-1", "-fflags", "+bitexact",
      "-f", "wav", "pipe:1",
    ]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve(fixWavSizes(Buffer.concat(out)));
      else reject(new Error(`ffmpeg salió con ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
    });
    ff.stdin.on("error", () => {});
    ff.stdin.end(Buffer.from(input));
  });
}
