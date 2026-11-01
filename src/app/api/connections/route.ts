import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_COOKIE, addConnection, listConnections, resolveConnection, toView, type Connection } from "@/lib/server/connections";
import { readObject, validate, type ConnectionInput } from "@/lib/server/validate";

export async function GET(req: NextRequest) {
  const [all, active] = await Promise.all([listConnections(), resolveConnection(req.cookies.get(ACTIVE_COOKIE)?.value)]);
  return NextResponse.json({ connections: all.map(toView), active: active?.id ?? null });
}

export async function POST(req: NextRequest) {
  const read = await readObject<ConnectionInput>(req);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: read.status });
  const input = read.value;
  const problem = validate(input);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const conn: Omit<Connection, "id"> = {
    name: input.name?.trim() || input.address!.trim(),
    address: input.address!.trim(),
    transport: input.transport!,
    caFile: input.transport === "tls-ca" ? input.caFile!.trim() : undefined,
    token: input.token?.trim() || undefined,
  };
  return NextResponse.json(toView(await addConnection(conn)), { status: 201 });
}
