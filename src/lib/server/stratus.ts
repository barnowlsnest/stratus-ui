import "server-only";
import { status, type ServiceError } from "@grpc/grpc-js";
import { createStratusClient, type OutputRecord, type Range, type StratusClient } from "ts-stratus";
import type { AddResult, DeleteResult, StreamInfo, StreamRange, StreamRecord } from "@/lib/types";
import type { Connection } from "./connections";

/** One response is held in memory whole; a range of very large records past this is refused instead. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const clients = new Map<string, StratusClient>();

const build = (c: Connection): StratusClient =>
  createStratusClient({
    address: c.address,
    token: c.token ?? "",
    tls: c.transport === "plaintext" ? false : c.transport === "tls-ca" && c.caFile ? { caFile: c.caFile } : true,
    channelOptions: { "grpc.max_receive_message_length": MAX_RESPONSE_BYTES },
  });

function clientFor(c: Connection): StratusClient {
  const key = [c.id, c.address, c.transport, c.caFile ?? "", c.token ?? ""].join("|");
  let client = clients.get(key);
  if (!client) {
    client = build(c);
    clients.set(key, client);
  }
  return client;
}

/** Closes and forgets the clients of a removed connection, releasing their channels and tokens. */
export function evictClients(id: string): void {
  for (const [key, client] of clients) {
    if (key.startsWith(`${id}|`)) {
      client.close();
      clients.delete(key);
    }
  }
}

/** A gRPC failure reduced to what the UI shows. */
export class StratusError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function toError(err: unknown): StratusError {
  if (err instanceof StratusError) return err;
  const e = err as Partial<ServiceError>;
  if (typeof e.code === "number") {
    const code = status[e.code] ?? "UNKNOWN";
    return new StratusError(`${code}: ${e.details || e.message}`, code);
  }
  return new StratusError(err instanceof Error ? err.message : String(err), "UNKNOWN");
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toError(e);
  }
}

/** IDs and counts are uint64; the UI uses numbers, so anything past 2^53 is refused rather than silently rounded. */
function safe(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new StratusError(`ID ${n} is beyond 2^53 and cannot be shown exactly`, "ID_OUT_OF_RANGE");
  return Number(n);
}

const range = (r: Range): StreamRange => ({ start: safe(r.start), end: safe(r.end) });
export const toRecord = (r: OutputRecord): StreamRecord => ({ id: safe(r.id), data: Buffer.from(r.rawData).toString("base64") });

export function getInfo(c: Connection): Promise<StreamInfo> {
  return run(async () => toInfo(await clientFor(c).getStreamInfo({ deadlineMs: 5_000 })));
}

/** Tries a connection that is not saved: a one-off client, closed afterwards, never cached. */
export function probeInfo(c: Connection): Promise<StreamInfo> {
  return run(async () => {
    const client = build(c);
    try {
      return toInfo(await client.getStreamInfo({ deadlineMs: 5_000 }));
    } finally {
      client.close();
    }
  });
}

const toInfo = (info: Awaited<ReturnType<StratusClient["getStreamInfo"]>>): StreamInfo => ({
  range: range(info.range),
  cached: safe(info.cachedRecords),
  disk: safe(info.fsRecords),
});

export async function readRange(c: Connection, startId: number, endId: number): Promise<StreamRecord[]> {
  try {
    const records = await run(() => clientFor(c).readRange(startId, endId, { deadlineMs: 10_000 }));
    return records.map(toRecord);
  } catch (e) {
    // An empty stream, or a window outside it, simply has nothing to show.
    if (e instanceof StratusError && e.code === "OUT_OF_RANGE") return [];
    if (e instanceof StratusError && e.code === "RESOURCE_EXHAUSTED") throw new StratusError(`${e.message} (the response is too large to load; narrow the range)`, e.code);
    throw e;
  }
}

export function addRecord(c: Connection, dedupKey: string, data: Buffer): Promise<AddResult> {
  return run(async () => {
    const res = await clientFor(c).add([{ dedupKey: BigInt(dedupKey), rawData: data }], { deadlineMs: 10_000 });
    return { added: range(res.addedRecords), stream: range(res.streamRecords), duplicates: safe(res.duplicateRecords) };
  });
}

export function deleteUpTo(c: Connection, endId: string): Promise<DeleteResult> {
  return run(async () => {
    const res = await clientFor(c).deleteUpTo(BigInt(endId), { deadlineMs: 10_000 });
    return { deleted: range(res.deletedRecords), stream: range(res.streamRecords) };
  });
}

export function reconcile(c: Connection): Promise<StreamRange> {
  return run(async () => range(await clientFor(c).reconcileCache({ deadlineMs: 60_000 })));
}

/** Yields at most `n` records, then returns, which cancels the underlying call. */
async function* take(source: AsyncGenerator<OutputRecord, void>, n: number): AsyncGenerator<OutputRecord, void> {
  if (n <= 0) return;
  let seen = 0;
  for await (const record of source) {
    yield record;
    if (++seen >= n) return;
  }
}

/**
 * Opens a live tail of exactly `maxRecords`, or fewer if it times out. The server
 * stops one record short when it catches up with the stream (and sends nothing
 * for a max of 1), so ask for one more and stop at the limit here.
 * Breaking out of the loop cancels the underlying call.
 */
export function openTail(c: Connection, startId: number, maxRecords: number, timeoutSec: number): AsyncGenerator<OutputRecord, void> {
  const serverTimeoutMs = Math.max(1, Math.floor(timeoutSec)) * 1000;
  return take(clientFor(c).readOffset(startId, maxRecords + 1, { serverTimeoutMs }), maxRecords);
}
