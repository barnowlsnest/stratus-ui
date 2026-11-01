import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, STRATUS_ADDRESS } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  // Every test shares one stream on one server, so they run one at a time, in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // The production bundle, as the Docker image runs it. `.data` is recreated by the build, so the
    // seeded connection points at the throwaway server too.
    command: "npm run build && cp -R .next/static .next/standalone/.next/static && node .next/standalone/server.js",
    url: `${BASE_URL}/api/connections`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", STRATUS_ADDR: STRATUS_ADDRESS, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
