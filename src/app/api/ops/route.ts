import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail } from "@/lib/server/api";
import { readJsonBounded } from "@/lib/server/body";
import { addRecord, deleteUpTo, reconcile } from "@/lib/server/stratus";
import type { OpRequest } from "@/lib/types";

/** The server's default record limit is 8 MiB; base64 adds a third, plus room for the JSON around it. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const UINT64_MAX = 2n ** 64n - 1n;

const isId = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d*$/.test(v.trim()) && BigInt(v.trim()) <= UINT64_MAX;

/** Decodes standard base64 once; null when it has stray characters or bad padding (it must encode back to the same text). */
function decodeBase64(v: unknown): Buffer | null {
  if (typeof v !== "string") return null;
  const bytes = Buffer.from(v, "base64");
  return bytes.toString("base64") === v ? bytes : null;
}

/** Append, delete and reconcile: the three commands that change the stream. */
export async function POST(req: NextRequest) {
  const read = await readJsonBounded(req, MAX_BODY_BYTES);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  if (typeof read.value !== "object" || read.value === null) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = read.value as OpRequest;
  try {
    const conn = await connectionFor(req);
    switch (body.op) {
      case "append": {
        if (!isId(body.dedupKey)) return NextResponse.json({ error: "Dedup key must be a non-zero number up to 2^64 - 1" }, { status: 400 });
        const data = decodeBase64(body.data);
        if (!data) return NextResponse.json({ error: "Data must be valid base64" }, { status: 400 });
        if (data.length === 0) return NextResponse.json({ error: "Data must not be empty" }, { status: 400 });
        return NextResponse.json(await addRecord(conn, body.dedupKey.trim(), data));
      }
      case "delete":
        if (!isId(body.endId)) return NextResponse.json({ error: "ID must be a non-zero number up to 2^64 - 1" }, { status: 400 });
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
