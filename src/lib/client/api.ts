import type { ApiError } from "@/lib/types";

/** JSON fetch against our own route handlers; throws an Error carrying the server's message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as ApiError).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const post = <T>(url: string, body: unknown) => api<T>(url, { method: "POST", body: JSON.stringify(body) });
