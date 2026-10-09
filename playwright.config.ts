import { defineConfig, devices } from "@playwright/test";
import { TEST_DB } from "./e2e/test-db";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    // Runs alone first: it asserts the empty state before any spec creates a league.
    { name: "empty-state", testMatch: /home\.spec\.ts/, use: devices["Desktop Chrome"] },
    {
      name: "chromium",
      testIgnore: /home\.spec\.ts/,
      dependencies: ["empty-state"],
      use: devices["Desktop Chrome"],
    },
  ],
  // A dedicated production server and throwaway database, so a browser run can
  // never read or write the developer's own leagues.
  webServer: {
    command: `node -e "require('node:fs').rmSync('${TEST_DB}', { force: true })" && npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { FDF_DB_PATH: TEST_DB },
  },
});
