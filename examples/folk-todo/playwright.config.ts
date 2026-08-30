import { defineConfig } from "@playwright/test";
import { worktreePort } from "../../playwright.worktree-port.mjs";

const port = worktreePort(5174, "FOLK_TODO_PLAYWRIGHT_PORT");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Every test boots PGlite (~1s locally, a few seconds on CI runners).
  timeout: 30000,
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
