import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail, parseId } from "@/lib/server/api";
import { getInfo, readRange } from "@/lib/server/stratus";

/** The most records one read returns; keeps a huge stream from flooding the browser. */
const MAX_RECORDS = 500;

export async function GET(req: NextRequest) {
  const start = parseId(req.nextUrl.searchParams.get("start"));
  const end = parseId(req.nextUrl.searchParams.get("end"));
  if (start === null || end === null) return NextResponse.json({ error: "IDs must be whole numbers" }, { status: 400 });
  try {
    const conn = await connectionFor(req);
    const info = await getInfo(conn);
    const first = info.range.start || 1;
    const last = info.range.end;
    if (info.disk === 0 || last === 0) return NextResponse.json({ records: [], truncated: false });

    // 0 means "the stream's first / last ID"; cap the window, newest first kept.
    let from = start || first;
    const to = Math.min(end || last, last);
    let truncated = false;
    if (to - from + 1 > MAX_RECORDS) {
      truncated = true;
      if (start === 0) from = to - MAX_RECORDS + 1;
      else return NextResponse.json({ records: await readRange(conn, from, from + MAX_RECORDS - 1), truncated });
    }
    return NextResponse.json({ records: await readRange(conn, from, to), truncated });
  } catch (e) {
    return fail(e);
  }
}
