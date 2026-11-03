import { getKv } from "./kv";
import type { ActionRecord, MessageRecord } from "./types";

// Estado propio de Socio: mensajes, acciones propuestas, aprobaciones y auditoría.
// Nunca vive en la base del sistema conectado.

interface Data {
  messages: MessageRecord[];
  actions: ActionRecord[];
}

const KEY = "socio-state";
const MAX_MESSAGES = 300;

export interface Store {
  saveMessage(m: MessageRecord): Promise<void>;
  saveAction(a: ActionRecord): Promise<void>;
  getAction(id: string): Promise<ActionRecord | null>;
  /** Pasa la acción de pending_approval a "processing" de forma atómica dentro del proceso. */
  claimAction(id: string): Promise<ActionRecord | null>;
  findMessageByExternalId(id: string): Promise<MessageRecord | null>;
  recent(limit?: number): Promise<{ messages: MessageRecord[]; actions: ActionRecord[] }>;
  clear(): Promise<void>;
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

const load = async (): Promise<Data> => (await getKv().get<Data>(KEY)) ?? { messages: [], actions: [] };

// Serializa las escrituras dentro del proceso para no pisar cambios concurrentes.
let chain: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (d: Data) => T): Promise<T> {
  const run = chain.then(async () => {
    const d = await load();
    const r = fn(d);
    if (d.messages.length > MAX_MESSAGES) {
      const keep = d.messages.slice(-MAX_MESSAGES);
      const ids = new Set(keep.flatMap((m) => m.actionIds));
      d.messages = keep;
      d.actions = d.actions.filter((a) => ids.has(a.id) || a.status === "pending_approval");
    }
    await getKv().set(KEY, d);
    return r;
  });
  chain = run.catch(() => {});
  return run;
}

export function getStore(): Store {
  return {
    saveMessage: (m) => mutate((d) => upsert(d.messages, m)),
    saveAction: (a) => mutate((d) => upsert(d.actions, a)),
    async getAction(id) {
      return (await load()).actions.find((a) => a.id === id) ?? null;
    },
    claimAction: (id) =>
      mutate((d) => {
        const a = d.actions.find((x) => x.id === id);
        if (!a || a.status !== "pending_approval") return null;
        a.status = "processing";
        return { ...a, status: "pending_approval" as const };
      }),
    async findMessageByExternalId(id) {
      return (await load()).messages.find((m) => m.externalId === id) ?? null;
    },
    async recent(limit = 50) {
      const d = await load();
      const messages = d.messages.slice(-limit).reverse();
      const ids = new Set(messages.flatMap((m) => m.actionIds));
      return { messages, actions: d.actions.filter((a) => ids.has(a.id)) };
    },
    clear: () =>
      mutate((d) => {
        d.messages = [];
        d.actions = [];
      }),
  };
}
