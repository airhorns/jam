// Visual inspection: writes one PNG per component per theme into ./shots.
// Run with `pnpm shots`. Not a regression test — the images are for humans
// (and agents) to look at. Filter with SHOTS=Button,Card.
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loadRegistry, showComponent } from "./helpers";

const outDir = new URL("../shots/", import.meta.url).pathname;
const only = process.env.SHOTS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

test("screenshot every component", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  mkdirSync(outDir, { recursive: true });
  const registry = await loadRegistry(page);
  for (const entry of registry) {
    if (only && !only.includes(entry.name.toLowerCase())) continue;
    for (const theme of ["light", "dark"] as const) {
      await showComponent(page, entry.name, theme);
      await page.waitForTimeout(150);
      await page.locator("[data-component]").screenshot({
        path: `${outDir}${entry.name}.${theme}.png`,
        animations: "disabled",
      });
    }
  }
});
