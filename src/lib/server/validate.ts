import "server-only";
import type { Transport } from "@/lib/types";
import { readJsonBounded } from "./body";

const TRANSPORTS: Transport[] = ["plaintext", "tls", "tls-ca"];
const ADDRESS = /^[A-Za-z0-9._-]+:\d{1,5}$/;

export interface ConnectionInput {
  name?: string;
  address?: string;
  transport?: Transport;
  caFile?: string;
  token?: string;
}

/** Connection forms are a few short strings; anything near this size is not one. */
const MAX_FORM_BYTES = 64 * 1024;

/**
 * The JSON body of a request as a plain object. Invalid JSON, `null`, an array
 * or a number is `{}` (validation then says what is missing); a body over 64 KiB is refused.
 */
export async function readObject<T extends object>(req: Request): Promise<{ value: Partial<T> } | { status: number; error: string }> {
  const read = await readJsonBounded(req, MAX_FORM_BYTES);
  if (!read.ok) return read.status === 413 ? { status: 413, error: read.error } : { value: {} };
  const body = read.value;
  return { value: typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Partial<T>) : {} };
}

const text = (v: unknown): v is string => typeof v === "string";

/** Validates user input; returns a message when it is not usable. */
export function validate(i: ConnectionInput): string | null {
  if (!text(i.address) || !ADDRESS.test(i.address.trim())) return "Address must look like host:port";
  if (!text(i.transport) || !TRANSPORTS.includes(i.transport)) return "Unknown transport";
  if (i.name !== undefined && !text(i.name)) return "Name must be text";
  if (i.token !== undefined && !text(i.token)) return "Token must be text";
  if (i.caFile !== undefined && !text(i.caFile)) return "CA file must be text";
  if (i.transport === "tls-ca" && !i.caFile?.trim()) return "A CA file path is required for custom TLS";
  return null;
}
