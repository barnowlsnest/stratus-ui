import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail, parseId } from "@/lib/server/api";
import { openTail, toError, toRecord } from "@/lib/server/stratus";

export const dynamic = "force-dynamic";

/** Practical bounds for one tail: far beyond any UI use, well inside a gRPC duration. */
const MAX_RECORDS = 100_000;
const MAX_TIMEOUT_SEC = 3600;

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Live tail as server-sent events: `records`, then `end` or `error`. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const start = parseId(q.get("start"));
  const max = parseId(q.get("max"));
  const timeout = parseId(q.get("timeout"));
  if (start === null || max === null || timeout === null) return NextResponse.json({ error: "start, max and timeout must be whole numbers" }, { status: 400 });
  if (max > MAX_RECORDS || timeout > MAX_TIMEOUT_SEC) {
    return NextResponse.json({ error: `max is at most ${MAX_RECORDS} and timeout at most ${MAX_TIMEOUT_SEC}s` }, { status: 400 });
  }
  // Creating the client reads any CA file, so it can throw as well as the connection lookup.
  let records: ReturnType<typeof openTail>;
  try {
    records = openTail(await connectionFor(req), start || 1, max || 100, timeout || 30);
  } catch (e) {
    return fail(toError(e));
  }
  const encoder = new TextEncoder();

  // Pull-based: the next record is only read from gRPC once the previous one has been taken by the
  // HTTP response, so a slow client slows the tail instead of growing a queue in memory.
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          if (req.signal.aborted) {
            await records.return(undefined);
            controller.close();
            return;
          }
          const next = await records.next();
          if (next.done) {
            controller.enqueue(encoder.encode(sse("end", {})));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(sse("records", [toRecord(next.value)])));
        } catch (e) {
          const err = toError(e);
          // Cancelling on purpose (the tab closed) is not an error to report.
          if (err.code !== "CANCELLED") controller.enqueue(encoder.encode(sse("error", { error: err.message, code: err.code })));
          controller.close();
        }
      },
      async cancel() {
        // The client went away: leaving the generator cancels the gRPC call.
        await records.return(undefined).catch(() => undefined);
      },
    },
    { highWaterMark: 1 },
  );

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
