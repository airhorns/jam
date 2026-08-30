import { defineConfig } from "@playwright/test";
import { worktreePort } from "../../playwright.worktree-port.mjs";

const port = worktreePort(5175, "LINEARLITE_PLAYWRIGHT_PORT");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  // Every test boots PGlite and seeds the database (~1.5s locally, a few seconds on CI runners).
  expect: { timeout: 10000 },
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `corepack pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
