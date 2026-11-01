import { NextResponse, type NextRequest } from "next/server";
import { evictClients } from "@/lib/server/stratus";
import { ACTIVE_COOKIE, getConnection, removeConnection } from "@/lib/server/connections";

type Ctx = { params: Promise<{ id: string }> };

/** Makes this server the one every other page talks to. */
export async function PUT(_req: NextRequest, { params }: Ctx) {
  const conn = await getConnection((await params).id);
  if (!conn) return NextResponse.json({ error: "No such server" }, { status: 404 });
  const res = NextResponse.json({ active: conn.id });
  res.cookies.set(ACTIVE_COOKIE, conn.id, { path: "/", sameSite: "lax", httpOnly: true });
  return res;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  await removeConnection(id);
  evictClients(id);
  return NextResponse.json({ ok: true });
}
