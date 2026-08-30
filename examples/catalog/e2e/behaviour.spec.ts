import { test, expect, type Locator, type Page } from "@playwright/test";
import { showComponent, trackErrors } from "./helpers";

/**
 * Behaviour that only a real browser can exercise: layout-driven placement,
 * native Tab order, wheel scrolling, pointer drags and real timers.
 */

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = trackErrors(page);
});
test.afterEach(() => {
  expect(errors, errors.join("\n")).toEqual([]);
});

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, `${locator} is laid out`).not.toBeNull();
  return rect!;
}

/** Wait for an animating element to come to rest, then return its box. */
async function settled(locator: Locator) {
  let last = await box(locator);
  for (let i = 0; i < 30; i++) {
    await locator.page().waitForTimeout(80);
    const next = await box(locator);
    if (Math.abs(next.y - last.y) < 0.5 && Math.abs(next.x - last.x) < 0.5) return next;
    last = next;
  }
  return last;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test.describe("floating placement", () => {
  test("a popover flips to the side with room when its preferred side is off screen", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 240 });
    await showComponent(page, "Popover", "light", 0);
    const trigger = page.getByTestId("popover-top");
    await trigger.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const triggerBox = await box(trigger);
    expect(triggerBox.y, "trigger sits near the top edge").toBeLessThan(80);
    await trigger.click();

    const content = page.locator("[data-layer][role=dialog]");
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute("data-placement", /^bottom/);
    const contentBox = await settled(content);
    expect(contentBox.y).toBeGreaterThan(triggerBox.y + triggerBox.height);
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(240);
  });

  test("a popover whose side has no horizontal room flips to the other side", async ({ page }) => {
    await showComponent(page, "Popover", "light", 0);
    const trigger = page.getByTestId("popover-left");
    await trigger.click();
    const content = page.locator("[data-layer][role=dialog]");
    await expect(content).toBeVisible();
    const triggerBox = await box(trigger);
    const contentBox = await settled(content);
    expect(contentBox.x, "content stays inside the viewport").toBeGreaterThanOrEqual(0);
    if (contentBox.width > triggerBox.x) {
      await expect(content).toHaveAttribute("data-placement", /^right/);
      expect(contentBox.x).toBeGreaterThan(triggerBox.x + triggerBox.width);
    } else {
      await expect(content).toHaveAttribute("data-placement", /^left/);
    }
  });

  test("a popover keeps its preferred side when it fits", async ({ page }) => {
    await showComponent(page, "Popover", "light", 0);
    const trigger = page.getByTestId("popover-top");
    await trigger.click();
    const content = page.locator("[data-layer][role=dialog]");
    await expect(content).toHaveAttribute("data-placement", /^top/);
    const triggerBox = await box(trigger);
    const contentBox = await settled(content);
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(triggerBox.y);
    expect(contentBox.x, "shifted to stay inside the viewport").toBeGreaterThanOrEqual(0);
    const arrowBox = await box(content.locator("span[aria-hidden=true]").first());
    expect(Math.abs(arrowBox.x + arrowBox.width / 2 - (triggerBox.x + triggerBox.width / 2)), "arrow points at the trigger").toBeLessThan(2);
  });
});

test.describe("modal dialogs", () => {
  test("Tab and Shift+Tab stay inside an open dialog and focus returns to the trigger on close", async ({ page }) => {
    await showComponent(page, "Dialog", "light", 0);
    await page.getByTestId("open-dialog").click();
    const content = page.getByTestId("dialog-content");
    await expect(content).toBeVisible();

    const insideContent = () => page.evaluate(() => !!document.activeElement?.closest("[data-testid=dialog-content]"));
    expect(await insideContent()).toBe(true);
    const tabbable = await content.evaluate((el) => el.querySelectorAll("input, button, [tabindex='0']").length);
    for (let i = 0; i < tabbable + 2; i++) {
      await page.keyboard.press("Tab");
      expect(await insideContent(), `after ${i + 1} Tabs`).toBe(true);
    }
    for (let i = 0; i < tabbable + 2; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await insideContent(), `after ${i + 1} Shift+Tabs`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);
    await expect(page.getByTestId("open-dialog")).toBeFocused();
  });

  test("the page cannot be wheel-scrolled behind an open dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 400 });
    await showComponent(page, "Dialog");
    const scrollY = () => page.evaluate(() => window.scrollY);
    await page.mouse.move(550, 200);
    await page.mouse.wheel(0, 200);
    await expect.poll(scrollY).toBeGreaterThan(0);
    const before = await scrollY();

    await page.getByTestId("open-dialog").click();
    await expect(page.getByTestId("dialog-content")).toBeVisible();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    expect(await scrollY()).toBe(before);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dialog-content")).toHaveCount(0);
    await page.mouse.wheel(0, 300);
    await expect.poll(scrollY).toBeGreaterThan(before);
  });
});

test.describe("pointer interaction", () => {
  test("dragging a slider thumb changes the value and clicking the track jumps to it", async ({ page }) => {
    await showComponent(page, "Slider", "light", 0);
    const slider = page.getByTestId("volume-slider");
    const thumb = page.getByTestId("volume-thumb");
    const value = page.getByTestId("volume-value");
    await expect(value).toHaveText("Volume: 40");

    const track = await box(slider);
    const start = await box(thumb);
    const centre = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    await drag(page, centre, { x: centre.x + track.width / 4, y: centre.y });
    const dragged = Number(await thumb.getAttribute("aria-valuenow"));
    expect(dragged).toBeGreaterThanOrEqual(60);
    expect(dragged).toBeLessThanOrEqual(70);
    await expect(value).toHaveText(`Volume: ${dragged}`);

    await page.mouse.click(track.x + track.width * 0.1, track.y + track.height / 2);
    const jumped = Number(await thumb.getAttribute("aria-valuenow"));
    expect(jumped).toBeGreaterThanOrEqual(5);
    expect(jumped).toBeLessThanOrEqual(15);

    await thumb.focus();
    await page.keyboard.press("ArrowRight");
    await expect(thumb).toHaveAttribute("aria-valuenow", String(jumped + 1));
  });

  test("dragging a sheet handle down past its lowest snap point dismisses it", async ({ page }) => {
    await showComponent(page, "Sheet", "light", 0);
    await page.getByTestId("open-sheet").click();
    const frame = page.getByTestId("sheet-frame");
    await expect(frame).toBeVisible();
    await expect(page.getByText("open = true, position = 0")).toBeVisible();

    const handle = page.locator(".is_SheetHandle");
    const grip = await settled(handle);
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await drag(page, from, { x: from.x, y: from.y + 200 }, 20);
    await expect(page.getByText("open = true, position = 1")).toBeVisible();

    const lower = await settled(handle);
    const again = { x: lower.x + lower.width / 2, y: lower.y + lower.height / 2 };
    await drag(page, again, { x: again.x, y: 800 }, 20);
    await expect(frame).toHaveCount(0);
    await expect(page.getByText("open = false, position = 1")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
});

test.describe("keyboard interaction", () => {
  test("typing in an open select moves to the matching option and Enter picks it", async ({ page }) => {
    await showComponent(page, "Select", "light", 0);
    const trigger = page.getByTestId("fruit-select-trigger");
    await trigger.click();
    const listbox = page.locator("[role=listbox]");
    await expect(listbox).toBeVisible();
    await expect(page.locator("[role=option][aria-selected=true]")).toHaveText("Banana");

    await page.keyboard.type("pe");
    await expect(page.locator("[role=option]:focus")).toHaveText("Peach");
    await page.keyboard.press("Enter");
    await expect(listbox).toHaveCount(0);
    await expect(page.getByTestId("fruit-value")).toHaveText("Selected: peach");
    await expect(trigger).toBeFocused();

    await trigger.press("ArrowDown");
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(listbox).toHaveCount(0);
    await expect(page.getByTestId("fruit-value")).toHaveText("Selected: peach");
  });
});

test.describe("timers", () => {
  test("a tooltip waits for its hover delay, then closes when the pointer leaves", async ({ page }) => {
    await showComponent(page, "Tooltip", "light", 0);
    const tooltip = page.locator("[role=tooltip]");
    await page.getByTestId("tooltip-top").hover();
    await page.waitForTimeout(150);
    await expect(tooltip).toHaveCount(0);
    await expect(tooltip).toBeVisible({ timeout: 1500 });
    await page.mouse.move(5, 5);
    await expect(tooltip).toHaveCount(0);
  });

  test("a toast dismisses itself after its duration unless hovered", async ({ page }) => {
    await showComponent(page, "Toast", "light", 0);
    await page.getByTestId("show-toast").click();
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await toast.hover();
    await page.waitForTimeout(4500);
    await expect(toast).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(toast).toHaveCount(0, { timeout: 6000 });
  });
});
