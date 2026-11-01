import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail, parseId } from "@/lib/server/api";
import { openTail, toError, toRecord } from "@/lib/server/stratus";

export const dynamic = "force-dynamic";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Live tail as server-sent events: `records`, then `end` or `error`. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const start = parseId(q.get("start"));
  const max = parseId(q.get("max"));
  const timeout = parseId(q.get("timeout"));
  if (start === null || max === null || timeout === null) return NextResponse.json({ error: "start, max and timeout must be whole numbers" }, { status: 400 });
  let conn;
  try {
    conn = await connectionFor(req);
  } catch (e) {
    return fail(e);
  }
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          /* client went away */
        }
      };
      try {
        for await (const record of openTail(conn, start || 1, max || 100, timeout || 30)) {
          // The tab closed: leaving the loop cancels the gRPC call.
          if (req.signal.aborted) return;
          send("records", [toRecord(record)]);
        }
        send("end", {});
      } catch (e) {
        const err = toError(e);
        // Cancelling on purpose (the tab closed) is not an error to report.
        if (err.code !== "CANCELLED") send("error", { error: err.message, code: err.code });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
