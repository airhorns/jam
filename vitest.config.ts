import { defineConfig } from "vitest/config";

const projects = ["packages/core", "packages/engine", "packages/ui", "packages/meta-agent"];
const gate = { lines: 90, statements: 90, functions: 90, branches: 90 };

// Runs the library packages' unit suites together; coverage is gated on the total and again per package so a small package can't hide behind the aggregate.
export default defineConfig({
  test: {
    projects,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/*.bench.*", "**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: { ...gate, ...Object.fromEntries(projects.map((project) => [`${project}/src/**`, gate])) },
    },
  },
});
