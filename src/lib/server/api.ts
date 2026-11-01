import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";
import { ACTIVE_COOKIE, getConnection, type Connection } from "./connections";
import { StratusError } from "./stratus";

/** The connection a request is for: `?conn=<id>` wins, then the active cookie. */
export async function connectionFor(req: NextRequest): Promise<Connection> {
  const conn = await getConnection(req.nextUrl.searchParams.get("conn") ?? req.cookies.get(ACTIVE_COOKIE)?.value);
  if (!conn) throw new StratusError("No server selected. Add one on the Connections page.", "NO_CONNECTION");
  return conn;
}

export function fail(e: unknown, status = 502): NextResponse<ApiError> {
  if (e instanceof StratusError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NO_CONNECTION" ? 409 : status });
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

/** A non-negative integer from a string, or null. IDs are uint64 on the wire; the UI never needs more than 2^53. */
export function parseId(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return 0;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}
