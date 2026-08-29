// Visual inspection: writes one PNG per component per theme into ./shots,
// plus one viewport PNG per demo that declares a `shot` recipe (opened
// dialogs, hovered tooltips…). Run with `pnpm shots`. Not a regression test —
// the images are for humans (and agents) to look at. Filter with SHOTS=Button,Card.
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loadRegistry, performRecipe, showComponent } from "./helpers";

const outDir = new URL("../shots/", import.meta.url).pathname;
const only = process.env.SHOTS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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
      for (const [i, demo] of entry.demos.entries()) {
        if (!demo.shot) continue;
        await showComponent(page, entry.name, theme, i);
        await performRecipe(page, demo.shot);
        await page.screenshot({ path: `${outDir}${entry.name}.${slug(demo.title)}.${theme}.png`, animations: "disabled" });
      }
    }
  }
});
