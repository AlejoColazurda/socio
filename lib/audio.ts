import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Convierte cualquier audio (las notas de voz de WhatsApp llegan en OGG/Opus) a WAV mono
 * PCM 16 bit a 16 kHz, que es lo que acepta Muse Voice Transcribe.
 */
export function toWav16k(input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg-static no disponible en esta plataforma"));
    const ff = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", "pipe:1"]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve(new Uint8Array(Buffer.concat(out)));
      else reject(new Error(`ffmpeg salió con ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
    });
    ff.stdin.on("error", () => {});
    ff.stdin.end(Buffer.from(input));
  });
}
