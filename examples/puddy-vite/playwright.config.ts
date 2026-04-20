import { defineConfig } from "@playwright/test";
import { worktreePort } from "../../playwright.worktree-port.mjs";

const port = worktreePort(5173, "PUDDY_VITE_PLAYWRIGHT_PORT");
const sandboxAgentPort = worktreePort(2468, "PUDDY_VITE_SANDBOX_AGENT_PORT");
const baseURL = `http://127.0.0.1:${port}`;
const sandboxAgentURL = `http://127.0.0.1:${sandboxAgentPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL,
  },
  webServer: [
    {
      command: [
        "corepack pnpm exec sandbox-agent install-agent mock --no-token",
        `corepack pnpm exec sandbox-agent server --no-token --no-telemetry --host 127.0.0.1 --port ${sandboxAgentPort}`,
      ].join(" && "),
      url: `${sandboxAgentURL}/v1/health`,
      reuseExistingServer: false,
    },
    {
      command: `SANDBOX_AGENT_URL=${sandboxAgentURL} corepack pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
