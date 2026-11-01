// Types shared by the Next.js server (route handlers) and the browser.

export type Transport = "plaintext" | "tls" | "tls-ca";

export const TRANSPORTS: { value: Transport; label: string }[] = [
  { value: "plaintext", label: "plaintext (insecure)" },
  { value: "tls", label: "tls (system roots)" },
  { value: "tls-ca", label: "tls (custom ca file)" },
];

/** A saved server, as the browser sees it: the token never leaves the server. */
export interface ConnectionView {
  id: string;
  name: string;
  address: string;
  transport: Transport;
  caFile?: string;
  hasToken: boolean;
}

export interface StreamRange {
  start: number;
  end: number;
}

export interface StreamInfo {
  range: StreamRange;
  cached: number;
  disk: number;
}

/** One record; `data` is the raw payload, base64 encoded. */
export interface StreamRecord {
  id: number;
  data: string;
}

export interface AddResult {
  added: StreamRange;
  stream: StreamRange;
  duplicates: number;
}

export interface DeleteResult {
  deleted: StreamRange;
  stream: StreamRange;
}

export interface ApiError {
  error: string;
  code?: string;
}

export type OpRequest =
  | { op: "append"; dedupKey: string; data: string }
  | { op: "delete"; endId: string }
  | { op: "reconcile" };
