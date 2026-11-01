// Regenerates docs/screenshots from a running console. README.md says how to start what it needs.
// It writes to the stream, so it uses only the connection seeded with the throwaway server.
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3100";
const STRATUS_ADDRESS = "127.0.0.1:8001";
const OUT = "docs/screenshots";

const CUSTOMERS = ["c-1042", "c-2281", "c-3307", "c-1198", "c-4410"];
const SKUS = ["KB-204", "MS-118", "HB-330", "MN-271"];
const TYPES = ["order.created", "payment.captured", "order.packed", "order.shipped"];

let key = Date.now();

function orderEvent(n: number) {
  return {
    type: TYPES[n % TYPES.length],
    order_id: `ord-${7300 + Math.floor(n / TYPES.length)}`,
    customer: CUSTOMERS[Math.floor(n / TYPES.length) % CUSTOMERS.length],
    items: [{ sku: SKUS[n % SKUS.length], qty: (n % 3) + 1 }],
    total_cents: 2499 + (n % 7) * 1250,
    currency: "EUR",
  };
}

async function append(page: Page, conn: string, n: number) {
  const data = Buffer.from(JSON.stringify(orderEvent(n))).toString("base64");
  const res = await page.request.post(`/api/ops?conn=${conn}`, { data: { op: "append", dedupKey: String(++key), data } });
  if (!res.ok()) throw new Error(`append failed: ${await res.text()}`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
page.setDefaultTimeout(10_000);

const { connections } = await (await page.request.get("/api/connections")).json();
if (connections.length !== 1 || connections[0].address !== STRATUS_ADDRESS) {
  throw new Error(`Expected only the seeded ${STRATUS_ADDRESS} connection; start from an empty .next/standalone/.data`);
}
const conn: string = connections[0].id;
await page.goto("/");
for (let n = 0; n < 24; n++) await append(page, conn, n);

// A second server that cannot be reached, as a saved staging link looks when it is down. .invalid never resolves, so the token goes nowhere.
await page.request.post("/api/connections", {
  data: { name: "orders-staging", address: "stratus.staging.example.invalid:8000", transport: "tls", token: "example" },
});

// Records
await page.goto("/");
await page.getByRole("button", { name: /order\.shipped/ }).last().waitFor();
await shot(page, "records");

// One record, as formatted JSON
await page.getByRole("button", { name: /order\.shipped/ }).last().click();
await page.getByRole("dialog").locator("pre").waitFor();
await shot(page, "record-detail");
await page.getByRole("dialog").getByRole("button", { name: "CLOSE", exact: true }).click();

// Live tail, with records arriving while it follows
await page.getByRole("tab", { name: "LIVE" }).click();
await page.getByLabel("START ID").fill("20");
await page.getByLabel("MAX RECORDS").fill("1000");
await page.getByLabel("TIMEOUT").fill("2m");
await page.getByRole("button", { name: "FOLLOW" }).click();
for (let n = 24; n < 36; n++) {
  await append(page, conn, n);
  await page.waitForTimeout(250);
}
await page.getByRole("button", { name: /order\.created/ }).last().waitFor();
await shot(page, "live-tail");
await page.getByRole("button", { name: "STOP" }).click();

// Operations: an append that was accepted, beside the delete and reconcile forms
await page.goto("/operations");
await page.getByLabel("DEDUP KEY").fill(String(++key));
await page.getByLabel("DATA").first().fill(JSON.stringify(orderEvent(36)));
await page.getByRole("button", { name: "▶ APPEND" }).click();
await page.getByText("added #").waitFor();
await page.getByLabel("DELETE BEFORE ID").fill("10");
await shot(page, "operations");

// A delete that went through
await page.getByRole("button", { name: "DELETE RECORDS" }).click();
await page.getByText("stream now #10").waitFor();
await shot(page, "delete");

// Connections: one server up, one down
await page.goto("/connections");
await page.getByText("OFFLINE").waitFor();
await page.getByText("ONLINE").waitFor();
await shot(page, "connections");

// Trying a new link that cannot be reached
await page.getByLabel("NAME").fill("orders-eu");
await page.getByLabel("ADDRESS").fill("127.0.0.1:9");
await page.getByRole("button", { name: "TEST" }).click();
await page.getByRole("alertdialog").waitFor();
await shot(page, "connection-failed");

await browser.close();
