import { defineConfig } from "@playwright/test";
import { worktreePort } from "../../playwright.worktree-port.mjs";

const port = worktreePort(5174, "FOLK_TODO_PLAYWRIGHT_PORT");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
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
