"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionRecord, Customer, MessageRecord, Product } from "@/lib/types";
import { ACTION_LABELS } from "@/lib/types";
import { blobToWav16k, fileToDataUrl, toBase64 } from "./wav";

interface State {
  connector: { id: string; name: string; readOnly: boolean; capabilities: string[] };
  mock: boolean;
  messages: MessageRecord[];
  actions: ActionRecord[];
  products: Product[];
  customers: Customer[];
}

interface Bubble {
  id: string;
  who: "me" | "bot";
  text: string;
  image?: string;
  approvals?: ActionRecord[];
}

const STATUS: Record<string, string> = {
  executed: "Ejecutado",
  answered: "Respondido",
  pending_approval: "Esperando OK",
  processing: "Procesando",
  blocked: "Bloqueado",
  rejected: "Cancelado",
  failed: "Falló",
};

const $ = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

const EXAMPLES = [
  "llegaron dos cajas de playadito",
  "vendí 2 fernet fiado a ruben",
  "el taller me pagó 10 lucas",
  "subile la coca grande a 4500",
  "cuántas oreo quedan?",
];

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: "hi", who: "bot", text: "¡Hola! Soy Socio. Mandame audios, fotos o texto y lo cargo en tu sistema por vos." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const recRef = useRef<MediaRecorder | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevStock = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const s = (await (await fetch("/api/state", { cache: "no-store" })).json()) as State;
    const diff = new Set<string>();
    for (const p of s.products) {
      if (prevStock.current[p.id] !== undefined && prevStock.current[p.id] !== p.stock + p.price) diff.add(p.id);
      prevStock.current[p.id] = p.stock + p.price;
    }
    if (diff.size) setChanged(diff);
    setState(s);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  async function send(payload: { text?: string; audioWavBase64?: string; imageDataUrl?: string }, mine: Bubble) {
    setBubbles((b) => [...b, mine]);
    setBusy(true);
    try {
      const res = await fetch("/api/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const r = (await res.json()) as { message?: MessageRecord; actions?: ActionRecord[]; error?: string };
      if (!r.message) throw new Error(r.error ?? "Error");
      const add: Bubble[] = [];
      if (r.message.hadAudio && r.message.transcript) add.push({ id: `${r.message.id}-t`, who: "bot", text: `🎙️ Escuché: "${r.message.transcript}"` });
      const pending = (r.actions ?? []).filter((a) => a.status === "pending_approval");
      add.push({ id: r.message.id, who: "bot", text: r.message.reply, approvals: pending });
      setBubbles((b) => [...b, ...add]);
    } catch (e) {
      setBubbles((b) => [...b, { id: String(Date.now()), who: "bot", text: `❌ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function sendText(t = text) {
    if (!t.trim() || busy) return;
    setText("");
    send({ text: t }, { id: String(Date.now()), who: "me", text: t });
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const wav = await blobToWav16k(new Blob(chunks, { type: rec.mimeType }));
      const secs = Math.round((wav.length - 44) / 32000);
      send({ audioWavBase64: toBase64(wav), text: text || undefined }, { id: String(Date.now()), who: "me", text: `🎤 Audio (${secs}s)${text ? `\n${text}` : ""}` });
      setText("");
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    send({ imageDataUrl: dataUrl, text: text || undefined }, { id: String(Date.now()), who: "me", text: text || "📷 Foto", image: dataUrl });
    setText("");
  }

  async function decide(id: string, approve: boolean) {
    const r = (await (await fetch(`/api/actions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve }) })).json()) as ActionRecord;
    setBubbles((b) => [
      ...b.map((x) => ({ ...x, approvals: x.approvals?.filter((a) => a.id !== id) })),
      { id: `${id}-d`, who: "me", text: approve ? "Sí, cargalo" : "No, cancelá" },
      { id: `${id}-r`, who: "bot", text: `${r.status === "executed" ? "✅" : r.status === "rejected" ? "↩️" : "⛔"} ${r.result ?? STATUS[r.status]}` },
    ]);
    refresh();
  }

  async function reset() {
    await fetch("/api/reset", { method: "POST" });
    setBubbles([{ id: "hi", who: "bot", text: "Arrancamos de cero. ¿Qué anotamos?" }]);
    prevStock.current = {};
    refresh();
  }

  const byId = new Map((state?.actions ?? []).map((a) => [a.id, a]));

  return (
    <main className="wrap">
      <header className="top">
        <div className="logo">
          <b>Socio</b>
          <span>completa por vos tu sistema, desde WhatsApp</span>
        </div>
        <div className="pills">
          <span className="pill on">Muse Spark · planifica</span>
          <span className="pill on">Muse Voice Transcribe · audios</span>
          <span className="pill on">SAM 3.1 · cuenta en fotos</span>
          <span className="pill">Conectado a: {state?.connector.name ?? "…"}{state?.connector.readOnly ? " (solo lectura)" : ""}</span>
          {state?.mock && <span className="pill">modo simulado</span>}
          {state?.connector.id === "demo" && (
            <button className="btn" onClick={reset}>Reiniciar demo</button>
          )}
        </div>
      </header>

      <div className="grid">
        <section className="card phone">
          <div className="head">
            Socio
            <small>{busy ? "escribiendo…" : "en línea"}</small>
          </div>
          <div className="chat" ref={chatRef}>
            {bubbles.map((b) => (
              <div key={b.id} className={`bubble ${b.who}`}>
                {b.image && <img src={b.image} alt="" />}
                {b.text}
                {b.approvals?.map((a) => (
                  <div key={a.id} className="btns">
                    <button className="btn primary" onClick={() => decide(a.id, true)}>Sí, cargalo</button>
                    <button className="btn" onClick={() => decide(a.id, false)}>No, cancelá</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="compose">
            <button className="icon ghost" title="Foto" onClick={() => fileRef.current?.click()} disabled={busy}>📷</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            <input
              type="text"
              value={text}
              placeholder={recording ? "Grabando… tocá ■ para enviar" : "Escribí o grabá un audio"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
            />
            {text.trim() ? (
              <button className="icon" onClick={() => sendText()} disabled={busy}>➤</button>
            ) : (
              <button className={`icon ${recording ? "rec" : ""}`} onClick={toggleRecord} disabled={busy}>{recording ? "■" : "🎤"}</button>
            )}
          </div>
          <div className="compose" style={{ flexWrap: "wrap", gap: 4 }}>
            {EXAMPLES.map((e) => (
              <button key={e} className="btn" onClick={() => sendText(e)} disabled={busy}>{e}</button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Qué hizo Socio y por qué</h2>
          <div className="feed">
            {!state?.messages.length && <div className="empty">Todavía no hay mensajes. Probá con un ejemplo de abajo del chat.</div>}
            {state?.messages.map((m) => (
              <article key={m.id} className="msg">
                <div className="meta">
                  <span>{new Date(m.createdAt).toLocaleTimeString("es-AR")}</span>
                  <span>{m.channel === "whatsapp" ? `WhatsApp ${m.from}` : "Panel"}</span>
                  {m.hadAudio && <span>🎙️ audio</span>}
                  {m.hadImage && <span>📷 foto</span>}
                  <span className="timings">
                    {Object.entries(m.timings).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(" · ")}
                  </span>
                </div>
                <div className="said">“{m.transcript || m.text || "(foto)"}”</div>
                {m.vision && <div className="result">SAM 3.1 buscó “{m.vision.prompt}” y encontró <b>{m.vision.count}</b>.</div>}
                {m.error && <div className="result" style={{ color: "var(--fail)" }}>{m.error}</div>}
                {m.actionIds.map((id) => {
                  const a = byId.get(id);
                  if (!a) return null;
                  return (
                    <div key={id} className="act">
                      <div className="row">
                        <b>{ACTION_LABELS[a.action.type]}{a.action.productName ? ` · ${a.action.productName}` : ""}{a.action.customerName ? ` · ${a.action.customerName}` : ""}</b>
                        <span className={`status ${a.status}`}>{STATUS[a.status]}</span>
                      </div>
                      <ul className="checks">
                        {a.checks.map((c, i) => (
                          <li key={i} className={c.status}>{c.message}</li>
                        ))}
                      </ul>
                      {a.result && <div className="result">→ {a.result}{a.decidedBy ? ` (${a.decidedBy})` : ""}</div>}
                      {a.status === "pending_approval" && (
                        <div className="btns" style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button className="btn primary" onClick={() => decide(a.id, true)}>Aprobar</button>
                          <button className="btn" onClick={() => decide(a.id, false)}>Rechazar</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>{state?.connector.name ?? "Sistema"} · en vivo</h2>
          <table>
            <thead>
              <tr><th>Producto</th><th className="n">Stock</th><th className="n">Precio</th></tr>
            </thead>
            <tbody>
              {state?.products.map((p) => (
                <tr key={`${p.id}-${p.stock}-${p.price}`} className={changed.has(p.id) ? "flash" : ""}>
                  <td>{p.name}</td>
                  <td className="n">{p.stock}</td>
                  <td className="n">{$(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!!state?.customers.length && (
            <>
              <h2 style={{ borderTop: "1px solid var(--line)" }}>Cuentas corrientes</h2>
              <table>
                <tbody>
                  {state.customers.map((c) => (
                    <tr key={`${c.id}-${c.balance}`}>
                      <td>{c.name}</td>
                      <td className="n">{$(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
