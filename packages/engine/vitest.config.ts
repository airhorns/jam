import { defineConfig } from "vitest/config";

// Without a config of its own, vitest run from this directory would pick up the workspace one.
export default defineConfig({
  test: {},
});
