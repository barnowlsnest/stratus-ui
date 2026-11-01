import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, STRATUS_ADDRESS } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    // The production bundle, as the Docker image runs it. The build copies the saved connections from
    // the repo's `.data` into the bundle, so remove them: only the seeded throwaway server may be loaded.
    command: "npm run build && rm -rf .next/standalone/.data && cp -R .next/static .next/standalone/.next/static && node .next/standalone/server.js",
    url: `${BASE_URL}/api/connections`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", STRATUS_ADDR: STRATUS_ADDRESS, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
