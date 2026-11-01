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

/** Validates user input; returns a message when it is not usable. */
export function validate(i: ConnectionInput): string | null {
  if (!i.address || !ADDRESS.test(i.address.trim())) return "Address must look like host:port";
  if (!i.transport || !TRANSPORTS.includes(i.transport)) return "Unknown transport";
  if (i.transport === "tls-ca" && !i.caFile?.trim()) return "A CA file path is required for custom TLS";
  return null;
}
