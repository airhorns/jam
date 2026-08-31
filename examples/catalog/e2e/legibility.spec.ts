import { test, expect } from "@playwright/test";
import { describe, flatten } from "@jam/ui/playwright";
import type { UINode } from "@jam/core";
import { GROUPS, loadRegistry, showComponent, trackErrors } from "./helpers";

/**
 * Every demo must be legible to an agent reading `describeUI()`: each control
 * it renders carries an accessible name, so the outline says what a press or
 * drive would act on rather than just that something is there.
 */

const CONTROLS = new Set([
  "button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "slider", "spinbutton", "combobox",
  "listbox", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "treeitem",
]);

const line = (node: UINode) => `${node.role} #${node.id}${node.component ? ` <${node.component}>` : ""}`;

test.describe("catalog legibility", () => {
  for (const group of GROUPS) {
    test(`${group} demos name every control in the outline`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = trackErrors(page);
      const registry = (await loadRegistry(page)).filter((entry) => entry.group === group);
      const unnamed: string[] = [];
      const empty: string[] = [];

      for (const entry of registry) {
        await showComponent(page, entry.name);
        const nodes = flatten(await describe(page, { interactive: true }));
        if (nodes.length === 0) empty.push(entry.name);
        for (const node of nodes) {
          if (CONTROLS.has(node.role) && !node.name) unnamed.push(`${entry.name}: ${line(node)}`);
        }
      }

      expect(empty, "pages with nothing interactive or drivable").toEqual([]);
      expect(unnamed, "controls without an accessible name").toEqual([]);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});
