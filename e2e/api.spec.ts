import { expect, test, type APIRequestContext } from "@playwright/test";
import { STRATUS_ADDRESS } from "./env";

const b64 = (s: string) => Buffer.from(s).toString("base64");

/** The dedup window outlives a run, so keys must differ between runs against the same server. */
let nextKey = Date.now();
const dedupKey = () => String(++nextKey);

test.describe.configure({ mode: "serial" });

let conn: string;

async function append(request: APIRequestContext, payload: string, key = dedupKey()) {
  const res = await request.post(`/api/ops?conn=${conn}`, { data: { op: "append", dedupKey: key, data: b64(payload) } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { added: { start: number; end: number }; stream: { start: number; end: number }; duplicates: number };
}

/** The events of a tail that has finished, in order. */
function parseEvents(body: string) {
  return body
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const [event, data] = chunk.split("\n");
      return { event: event.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) };
    });
}

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/connections", { data: { name: "e2e-api", address: STRATUS_ADDRESS, transport: "plaintext" } });
  expect(res.status()).toBe(201);
  conn = (await res.json()).id;
});

test.afterAll(async ({ request }) => {
  await request.delete(`/api/connections/${conn}`);
});

test.describe("connections", () => {
  test("lists a saved connection without its token", async ({ request }) => {
    const created = await request.post("/api/connections", {
      data: { name: "e2e-secret", address: STRATUS_ADDRESS, transport: "plaintext", token: "hunter2" },
    });
    const { id } = await created.json();
    const res = await request.get("/api/connections");
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text).connections).toContainEqual(expect.objectContaining({ id, hasToken: true }));
    await request.delete(`/api/connections/${id}`);
  });

  test("probes a reachable server and reports an unreachable one", async ({ request }) => {
    const ok = await request.post("/api/connections/test", { data: { id: conn } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty("range");

    const bad = await request.post("/api/connections/test", { data: { address: "127.0.0.1:1", transport: "plaintext" } });
    expect(bad.status()).toBe(502);
    expect((await bad.json()).code).toBe("UNAVAILABLE");
  });

  test("an unknown ?conn= is refused, not sent to the first server", async ({ request }) => {
    const res = await request.get("/api/info?conn=does-not-exist");
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe("NO_SUCH_CONNECTION");
  });
});

test.describe("stream", () => {
  test("append then read returns the same bytes", async ({ request }) => {
    const payload = `e2e ${Date.now()} ✓`;
    const { added, duplicates } = await append(request, payload);
    expect(duplicates).toBe(0);
    expect(added.end).toBe(added.start);

    const res = await request.get(`/api/records?conn=${conn}&start=${added.start}&end=${added.end}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ records: [{ id: added.start, data: b64(payload) }], truncated: false });
  });

  test("info follows appends", async ({ request }) => {
    const { stream } = await append(request, "info");
    const info = await (await request.get(`/api/info?conn=${conn}`)).json();
    expect(info.range).toEqual(stream);
    expect(info.disk).toBeGreaterThan(0);
  });

  test("a repeated dedup key is refused and writes nothing", async ({ request }) => {
    const key = dedupKey();
    const first = await append(request, "first", key);
    const second = await request.post(`/api/ops?conn=${conn}`, { data: { op: "append", dedupKey: key, data: b64("second") } });
    expect(second.status()).toBe(502);
    expect((await second.json()).code).toBe("ALREADY_EXISTS");
    const info = await (await request.get(`/api/info?conn=${conn}`)).json();
    expect(info.range.end).toBe(first.stream.end);
  });

  test("tail returns exactly the records asked for, then ends", async ({ request }) => {
    const start = (await append(request, "tail-0")).added.start;
    await append(request, "tail-1");
    await append(request, "tail-2");

    const res = await request.get(`/api/tail?conn=${conn}&start=${start}&max=3&timeout=5`);
    expect(res.headers()["content-type"]).toContain("text/event-stream");
    const events = parseEvents(await res.text());
    expect(events.map((e) => e.event)).toEqual(["records", "records", "records", "end"]);
    expect(events.slice(0, 3).map((e) => e.data[0].data)).toEqual(["tail-0", "tail-1", "tail-2"].map(b64));
  });

  test("tail of one record returns it", async ({ request }) => {
    const { added } = await append(request, "tail-one");
    const res = await request.get(`/api/tail?conn=${conn}&start=${added.start}&max=1&timeout=5`);
    const events = parseEvents(await res.text());
    expect(events.map((e) => e.event)).toEqual(["records", "end"]);
    expect(events[0].data[0]).toEqual({ id: added.start, data: b64("tail-one") });
  });

  test("tail errors reach EventSource as an event, and others as JSON", async ({ request }) => {
    const asEvents = await request.get("/api/tail?start=x", { headers: { accept: "text/event-stream" } });
    expect(asEvents.status()).toBe(200);
    expect(parseEvents(await asEvents.text())[0].event).toBe("error");

    const asJson = await request.get("/api/tail?start=x");
    expect(asJson.status()).toBe(400);
    expect(await asJson.json()).toHaveProperty("error");
  });

  test("delete keeps the record at the given ID", async ({ request }) => {
    await append(request, "delete-0");
    const { added } = await append(request, "delete-1");
    const res = await request.post(`/api/ops?conn=${conn}`, { data: { op: "delete", endId: String(added.start) } });
    expect(res.status()).toBe(200);
    expect((await res.json()).stream.start).toBe(added.start);

    const read = await request.get(`/api/records?conn=${conn}&start=${added.start}&end=${added.start}`);
    expect((await read.json()).records).toEqual([{ id: added.start, data: b64("delete-1") }]);
  });

  test("reconcile returns the stream's range", async ({ request }) => {
    const { stream } = await append(request, "reconcile");
    const res = await request.post(`/api/ops?conn=${conn}`, { data: { op: "reconcile" } });
    expect(res.status()).toBe(200);
    expect((await res.json()).range.end).toBe(stream.end);
  });

  test("bad operations are refused before reaching the server", async ({ request }) => {
    for (const data of [
      { op: "append", dedupKey: "0", data: b64("x") },
      { op: "append", dedupKey: "1", data: "not base64!" },
      { op: "append", dedupKey: "1", data: "" },
      { op: "delete", endId: "abc" },
      { op: "nope" },
    ]) {
      expect((await request.post(`/api/ops?conn=${conn}`, { data })).status(), JSON.stringify(data)).toBe(400);
    }
  });

  test("an oversized body gets 413", async ({ request }) => {
    const res = await request.post(`/api/ops?conn=${conn}`, {
      data: { op: "append", dedupKey: dedupKey(), data: "A".repeat(12 * 1024 * 1024 + 4) },
    });
    expect(res.status()).toBe(413);
  });
});

test.describe("proxy", () => {
  test("refuses other websites", async ({ request }) => {
    const byOrigin = await request.get("/api/connections", { headers: { origin: "https://evil.example" } });
    expect(byOrigin.status()).toBe(403);
    const byFetchMetadata = await request.get("/api/connections", { headers: { "sec-fetch-site": "cross-site" } });
    expect(byFetchMetadata.status()).toBe(403);
  });

  test("refuses a foreign Host", async ({ request }) => {
    const res = await request.get("/api/connections", { headers: { host: "evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("requires JSON on POST", async ({ request }) => {
    const res = await request.post("/api/ops", { headers: { "content-type": "text/plain" }, data: "{}" });
    expect(res.status()).toBe(415);
  });
});
