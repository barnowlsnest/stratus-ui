import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function listConnections(): Promise<Connection[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Connection[];
  } catch (e) {
    // Only a missing file means first run; a file the user emptied stays empty.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const initial = seed();
    await save(initial);
    return initial;
  }
}

async function save(all: Connection[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

export async function getConnection(id: string | undefined): Promise<Connection | undefined> {
  const all = await listConnections();
  return all.find((c) => c.id === id) ?? all[0];
}

export async function addConnection(input: Omit<Connection, "id">): Promise<Connection> {
  const all = await listConnections();
  const conn: Connection = { ...input, id: randomUUID() };
  await save([...all, conn]);
  return conn;
}

export async function removeConnection(id: string): Promise<void> {
  const all = await listConnections();
  await save(all.filter((c) => c.id !== id));
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
