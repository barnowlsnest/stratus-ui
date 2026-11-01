import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail } from "@/lib/server/api";
import { addRecord, deleteUpTo, reconcile } from "@/lib/server/stratus";
import type { OpRequest } from "@/lib/types";

/** Standard base64 that decodes to bytes and encodes back to the same text, so stray characters and bad padding are rejected. */
const isBase64 = (v: unknown): v is string => typeof v === "string" && Buffer.from(v, "base64").toString("base64") === v;

const isId = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d*$/.test(v.trim());

/** Append, delete and reconcile: the three commands that change the stream. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as OpRequest | null;
  if (typeof body !== "object" || body === null) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const conn = await connectionFor(req);
    switch (body.op) {
      case "append": {
        if (!isId(body.dedupKey)) return NextResponse.json({ error: "Dedup key must be a non-zero number" }, { status: 400 });
        if (!isBase64(body.data)) return NextResponse.json({ error: "Data must be valid base64" }, { status: 400 });
        const data = Buffer.from(body.data, "base64");
        if (data.length === 0) return NextResponse.json({ error: "Data must not be empty" }, { status: 400 });
        return NextResponse.json(await addRecord(conn, body.dedupKey.trim(), data));
      }
      case "delete":
        if (!isId(body.endId)) return NextResponse.json({ error: "ID must be a non-zero number" }, { status: 400 });
        return NextResponse.json(await deleteUpTo(conn, body.endId.trim()));
      case "reconcile":
        return NextResponse.json({ range: await reconcile(conn) });
      default:
        return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
