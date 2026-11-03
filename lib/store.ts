import fs from "node:fs";
import path from "node:path";
import type { ActionRecord, MessageRecord } from "./types";

// Estado propio de Socio: mensajes, acciones propuestas, aprobaciones y auditoría.
// Nunca vive en la base del sistema conectado.

interface Data {
  messages: MessageRecord[];
  actions: ActionRecord[];
}

export interface Store {
  saveMessage(m: MessageRecord): Promise<void>;
  saveAction(a: ActionRecord): Promise<void>;
  getAction(id: string): Promise<ActionRecord | null>;
  findMessageByExternalId(id: string): Promise<MessageRecord | null>;
  recent(limit?: number): Promise<{ messages: MessageRecord[]; actions: ActionRecord[] }>;
  clear(): Promise<void>;
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

function makeStore(load: () => Data, save: (d: Data) => void): Store {
  return {
    async saveMessage(m) {
      const d = load();
      upsert(d.messages, m);
      save(d);
    },
    async saveAction(a) {
      const d = load();
      upsert(d.actions, a);
      save(d);
    },
    async getAction(id) {
      return load().actions.find((a) => a.id === id) ?? null;
    },
    async findMessageByExternalId(id) {
      return load().messages.find((m) => m.externalId === id) ?? null;
    },
    async recent(limit = 50) {
      const d = load();
      const messages = d.messages.slice(-limit).reverse();
      const ids = new Set(messages.flatMap((m) => m.actionIds));
      return { messages, actions: d.actions.filter((a) => ids.has(a.id)) };
    },
    async clear() {
      save({ messages: [], actions: [] });
    },
  };
}

function memoryStore(): Store {
  let data: Data = { messages: [], actions: [] };
  return makeStore(
    () => data,
    (d) => (data = d),
  );
}

function fileStore(file: string): Store {
  return makeStore(
    () => {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as Data;
      } catch {
        return { messages: [], actions: [] };
      }
    },
    (d) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(d, null, 2));
    },
  );
}

let store: Store | null = null;

export function getStore(): Store {
  if (!store) {
    store =
      process.env.SOCIO_STORE === "memory"
        ? memoryStore()
        : fileStore(process.env.SOCIO_STORE_FILE || path.join(process.cwd(), ".data", "socio.json"));
  }
  return store;
}
