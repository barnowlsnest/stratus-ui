import "server-only";

export type BoundedJson = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

/**
 * Reads a JSON body without ever holding more than `maxBytes` of it: the
 * stream is counted as it arrives and cancelled once the limit is passed, so
 * a chunked request with no Content-Length cannot get around the cap.
 */
export async function readJsonBounded(req: Request, maxBytes: number): Promise<BoundedJson> {
  const tooLarge: BoundedJson = { ok: false, status: 413, error: "Request is too large" };
  if (Number(req.headers.get("content-length")) > maxBytes) return tooLarge;
  if (!req.body) return { ok: false, status: 400, error: "Invalid request" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return tooLarge;
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "Invalid request" };
  }
}
