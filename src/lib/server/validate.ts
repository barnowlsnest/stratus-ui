import "server-only";
import type { Transport } from "@/lib/types";

const TRANSPORTS: Transport[] = ["plaintext", "tls", "tls-ca"];
const ADDRESS = /^[A-Za-z0-9._-]+:\d{1,5}$/;

export interface ConnectionInput {
  name?: string;
  address?: string;
  transport?: Transport;
  caFile?: string;
  token?: string;
}

/** The JSON body of a request as a plain object; anything else (invalid JSON, `null`, an array, a number) is `{}`. */
export async function readObject<T extends object>(req: Request): Promise<Partial<T>> {
  const body: unknown = await req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Partial<T>) : {};
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
