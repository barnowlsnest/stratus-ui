import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectionView, Transport } from "@/lib/types";

/** A saved server including its secret; only ever used on the server. */
export interface Connection {
  id: string;
  name: string;
  address: string;
  transport: Transport;
  caFile?: string;
  token?: string;
}

export const ACTIVE_COOKIE = "stratus-conn";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "connections.json");

const seed = (): Connection[] => [
  {
    id: "local",
    name: "local",
    address: process.env.STRATUS_ADDR ?? "localhost:8000",
    transport: "plaintext",
    token: process.env.STRATUS_TOKEN || undefined,
  },
];

/** The saved connections, or undefined on first run (no file yet). A file the user emptied stays empty. */
async function load(): Promise<Connection[] | undefined> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Connection[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return undefined;
  }
}

/** Reads the file, creating it with the default connection on first run. Callers must hold the queue (or be `exclusive` themselves). */
async function loadOrSeed(): Promise<Connection[]> {
  const existing = await load();
  if (existing) return existing;
  const initial = seed();
  await save(initial);
  return initial;
}

export async function listConnections(): Promise<Connection[]> {
  // Seeding writes the file, so concurrent first requests go through the queue and only the first one writes.
  return (await load()) ?? exclusive(loadOrSeed);
}

/** Writes via a temp file and a rename, so a reader never sees a half-written file. */
async function save(all: Connection[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  await rename(tmp, FILE);
}

// Route handlers run concurrently; mutations are read-modify-write on one file, so run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** The saved connection with exactly this ID. */
export async function getConnection(id: string): Promise<Connection | undefined> {
  return (await listConnections()).find((c) => c.id === id);
}

/** Like `getConnection`, but a missing or stale ID (e.g. a cookie for a deleted server) falls back to the first saved one. */
export async function resolveConnection(id: string | undefined): Promise<Connection | undefined> {
  const all = await listConnections();
  return all.find((c) => c.id === id) ?? all[0];
}

export function addConnection(input: Omit<Connection, "id">): Promise<Connection> {
  return exclusive(async () => {
    const all = await loadOrSeed();
    const conn: Connection = { ...input, id: randomUUID() };
    await save([...all, conn]);
    return conn;
  });
}

export function removeConnection(id: string): Promise<void> {
  return exclusive(async () => {
    const all = await loadOrSeed();
    await save(all.filter((c) => c.id !== id));
  });
}

export function toView(c: Connection): ConnectionView {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    transport: c.transport,
    caFile: c.caFile,
    hasToken: Boolean(c.token),
  };
}
