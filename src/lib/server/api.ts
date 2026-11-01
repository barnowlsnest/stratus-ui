import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";
import { ACTIVE_COOKIE, getConnection, resolveConnection, type Connection } from "./connections";
import { StratusError } from "./stratus";

/** The connection a request is for: an explicit `?conn=<id>` must exist, otherwise the active cookie, otherwise the first saved one. */
export async function connectionFor(req: NextRequest): Promise<Connection> {
  const explicit = req.nextUrl.searchParams.get("conn");
  if (explicit) {
    const conn = await getConnection(explicit);
    if (!conn) throw new StratusError("No such server.", "NO_SUCH_CONNECTION");
    return conn;
  }
  const conn = await resolveConnection(req.cookies.get(ACTIVE_COOKIE)?.value);
  if (!conn) throw new StratusError("No server selected. Add one on the Connections page.", "NO_CONNECTION");
  return conn;
}

export function fail(e: unknown, status = 502): NextResponse<ApiError> {
  if (e instanceof StratusError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NO_CONNECTION" ? 409 : e.code === "NO_SUCH_CONNECTION" ? 404 : status });
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

/** A non-negative safe integer from a string (empty is 0), or null. IDs are uint64 on the wire; beyond 2^53 they would round, so they are rejected. */
export function parseId(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return 0;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}
