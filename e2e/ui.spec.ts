import { expect, test, type Page } from "@playwright/test";
import { STRATUS_ADDRESS } from "./env";

test.describe.configure({ mode: "serial" });

const NAME = `e2e-ui-${process.pid}-${Date.now()}`;

/** The dedup window outlives a run, so keys must differ between runs against the same server. */
let nextKey = Date.now() + 1_000_000;

async function openConnection(page: Page) {
  await page.goto("/connections");
  const row = page.getByRole("listitem").filter({ hasText: NAME }).first();
  await expect(row.getByText("ONLINE")).toBeVisible();
  await row.getByRole("button", { name: "OPEN" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("LIVE", { exact: true }).last()).toBeVisible();
}

async function appendThroughDialog(page: Page, payload: string) {
  await page.getByRole("button", { name: /▶ APPEND/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("DEDUP KEY").fill(String(++nextKey));
  await dialog.getByLabel("DATA").fill(payload);
  await dialog.getByRole("button", { name: "▶ APPEND" }).click();
  await expect(dialog.getByRole("status")).toContainText("added #");
  await dialog.getByRole("button", { name: "CANCEL" }).click();
}

test.beforeEach(({ page }) => {
  // Any uncaught exception in the browser fails the test, even if the page looks right.
  page.on("pageerror", (e) => {
    throw e;
  });
});

test.afterAll(async ({ request }) => {
  const { connections } = await (await request.get("/api/connections")).json();
  for (const c of connections) {
    if (c.name === NAME) await request.delete(`/api/connections/${c.id}`);
  }
});

test("adds a server and opens it", async ({ page }) => {
  await page.goto("/connections");
  await page.getByLabel("NAME").fill(NAME);
  await page.getByLabel("ADDRESS").fill(STRATUS_ADDRESS);
  await page.getByRole("button", { name: "TEST" }).click();
  await expect(page.getByRole("status")).toContainText("reachable");
  await page.getByRole("button", { name: "SAVE" }).click();
  // The form empties once the save has finished; navigating sooner would abandon it.
  await expect(page.getByLabel("NAME")).toHaveValue("");
  await openConnection(page);
});

test("shows an unreachable server as a failure", async ({ page }) => {
  await page.goto("/connections");
  await page.getByLabel("ADDRESS").fill("127.0.0.1:1");
  await page.getByRole("button", { name: "TEST" }).click();
  await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toContainText("UNAVAILABLE");
});

test("appends a record and reads it back", async ({ page }) => {
  await openConnection(page);
  const payload = `hello from the browser ${Date.now()}`;
  await appendThroughDialog(page, payload);

  const row = page.getByRole("button", { name: new RegExp(payload) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("dialog").locator("pre")).toHaveText(payload);
});

test("follows the stream live", async ({ page }) => {
  await openConnection(page);
  const payload = `live ${Date.now()}`;
  await appendThroughDialog(page, payload);

  await page.getByRole("tab", { name: "LIVE" }).click();
  const end = await page.evaluate(async () => (await (await fetch("/api/info")).json()).range.end as number);
  await page.getByLabel("START ID").fill(String(end));
  await page.getByLabel("MAX RECORDS").fill("1");
  await page.getByLabel("TIMEOUT").fill("5s");
  await page.getByRole("button", { name: "FOLLOW" }).click();

  await expect(page.getByRole("button", { name: new RegExp(payload) })).toBeVisible();
  await expect(page.getByText("tail ended")).toBeVisible();
});

test("deletes and reconciles from the Operations page", async ({ page }) => {
  await openConnection(page);
  await appendThroughDialog(page, "operations");
  const end = await page.evaluate(async () => (await (await fetch("/api/info")).json()).range.end as number);

  await page.goto("/operations");
  await page.getByLabel("DELETE BEFORE ID").fill(String(end));
  await page.getByRole("button", { name: "DELETE RECORDS" }).click();
  await expect(page.getByText(`stream now #${end} → #${end}`)).toBeVisible();

  await page.getByRole("button", { name: "RECONCILE CACHE" }).click();
  await expect(page.getByText("cache rebuilt over")).toBeVisible();
});
