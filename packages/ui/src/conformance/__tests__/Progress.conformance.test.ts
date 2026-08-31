// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, setupDefaultUI } from "../../testing";
import { Progress } from "../../components/Progress";

beforeEach(() => {
  setupDefaultUI();
});

const bar = (props: Record<string, unknown>) => render(h(Progress, props, h(Progress.Indicator, null)));
const indicator = (r: ReturnType<typeof render>) => r.get(".is_ProgressIndicator");

describe("Progress conformance", () => {
  describe("aria attributes", () => {
    // radix progress.tsx: role="progressbar" on the root.
    it("announces itself as a progressbar", () => {
      expect(bar({ value: 50 }).root.getAttribute("role")).toBe("progressbar");
    });

    // radix progress.tsx: aria-valuemin={0} aria-valuemax={max}, always present.
    it("always reports the range, even while indeterminate", () => {
      for (const props of [{ value: 50 }, {}, { value: null }]) {
        const r = bar(props);
        expect(r.root.getAttribute("aria-valuemin")).toBe("0");
        expect(r.root.getAttribute("aria-valuemax")).toBe("100");
      }
    });

    it("reports a custom max as aria-valuemax", () => {
      expect(bar({ value: 2, max: 8 }).root.getAttribute("aria-valuemax")).toBe("8");
    });

    // radix progress.tsx: aria-valuenow={isNumber(value) ? value : undefined}
    it("reports aria-valuenow for a known value", () => {
      expect(bar({ value: 37 }).root.getAttribute("aria-valuenow")).toBe("37");
    });

    // radix progress.tsx leaves aria-valuenow off when the value is null, which
    // is how a screen reader knows the progress is unknown.
    it("omits aria-valuenow and aria-valuetext while indeterminate", () => {
      for (const props of [{}, { value: null }]) {
        const r = bar(props);
        expect(r.root.hasAttribute("aria-valuenow")).toBe(false);
        expect(r.root.hasAttribute("aria-valuetext")).toBe(false);
      }
    });

    // radix progress.tsx defaultGetValueLabel: `${Math.round((value / max) * 100)}%`
    it("labels the value as a rounded percentage of max by default", () => {
      expect(bar({ value: 50 }).root.getAttribute("aria-valuetext")).toBe("50%");
      expect(bar({ value: 1, max: 3 }).root.getAttribute("aria-valuetext")).toBe("33%");
    });

    // radix progress.tsx: getValueLabel(value, max) builds aria-valuetext.
    it("uses a caller's getValueLabel for aria-valuetext", () => {
      const getValueLabel = vi.fn((value: number, max: number) => `${value} of ${max} files`);
      const r = bar({ value: 3, max: 8, getValueLabel });
      expect(r.root.getAttribute("aria-valuetext")).toBe("3 of 8 files");
      expect(getValueLabel).toHaveBeenCalledWith(3, 8);
      expect(r.root.hasAttribute("getValueLabel")).toBe(false);
    });

    it("does not call getValueLabel while indeterminate", () => {
      const getValueLabel = vi.fn(() => "never");
      bar({ getValueLabel });
      expect(getValueLabel).not.toHaveBeenCalled();
    });

    // docs/Progress.md: "A progress bar is not a label. Point aria-labelledby
    // at the text describing the task, or give it an aria-label."
    it("passes an accessible name through", () => {
      const r = bar({ value: 50, "aria-label": "Uploading" });
      expect(r.root.getAttribute("aria-label")).toBe("Uploading");
    });
  });

  describe("data attributes", () => {
    // radix progress.tsx getProgressState: null → indeterminate, value === max
    // → complete, otherwise loading.
    it("reports data-state as loading, complete or indeterminate", () => {
      expect(bar({ value: 50 }).root.getAttribute("data-state")).toBe("loading");
      expect(bar({ value: 100 }).root.getAttribute("data-state")).toBe("complete");
      expect(bar({ value: 8, max: 8 }).root.getAttribute("data-state")).toBe("complete");
      expect(bar({}).root.getAttribute("data-state")).toBe("indeterminate");
    });

    // radix progress.tsx: data-value={value ?? undefined} data-max={max}
    it("mirrors the value and max as data attributes", () => {
      const r = bar({ value: 3, max: 8 });
      expect(r.root.getAttribute("data-value")).toBe("3");
      expect(r.root.getAttribute("data-max")).toBe("8");
    });

    it("leaves data-value off while indeterminate but keeps data-max", () => {
      const r = bar({ max: 8 });
      expect(r.root.hasAttribute("data-value")).toBe(false);
      expect(r.root.getAttribute("data-max")).toBe("8");
    });

    // radix progress.tsx ProgressIndicator carries the same data-state,
    // data-value and data-max, read from the Progress context.
    it("mirrors state, value and max onto the indicator", () => {
      const r = bar({ value: 3, max: 8 });
      expect(indicator(r).getAttribute("data-state")).toBe("loading");
      expect(indicator(r).getAttribute("data-value")).toBe("3");
      expect(indicator(r).getAttribute("data-max")).toBe("8");
    });

    it("leaves the indicator's data-value off while indeterminate", () => {
      const r = bar({});
      expect(indicator(r).getAttribute("data-state")).toBe("indeterminate");
      expect(indicator(r).hasAttribute("data-value")).toBe(false);
    });
  });

  describe("invalid value and max", () => {
    // radix progress.tsx isValidMaxNumber: a max that is not a positive number
    // falls back to DEFAULT_MAX (100).
    it("falls back to a max of 100 when max is not a positive number", () => {
      for (const max of [0, -5, Number.NaN, "8" as unknown as number]) {
        const r = bar({ value: 50, max });
        expect(r.root.getAttribute("aria-valuemax")).toBe("100");
        expect(r.root.getAttribute("data-max")).toBe("100");
        expect(r.root.getAttribute("aria-valuetext")).toBe("50%");
        expect(r.root.getAttribute("data-state")).toBe("loading");
      }
    });

    // radix progress.tsx isValidValueNumber: NaN is not a valid value, so the
    // bar is indeterminate.
    it("treats a NaN value as indeterminate", () => {
      const r = bar({ value: Number.NaN });
      expect(r.root.getAttribute("data-state")).toBe("indeterminate");
      expect(r.root.hasAttribute("aria-valuenow")).toBe(false);
    });

    // radix progress.tsx: value defaults to null, so an omitted value is the
    // indeterminate case rather than zero.
    it("treats an omitted value as indeterminate rather than zero", () => {
      const r = bar({});
      expect(r.root.getAttribute("data-state")).toBe("indeterminate");
      expect(r.root.hasAttribute("aria-valuenow")).toBe(false);
    });

    it.skip("treats a value above max as indeterminate (docs/Progress.md: the library clamps the value to 0…max instead, so 150 of 100 reads as complete)", () => {});

    it.skip("treats a negative value as indeterminate (docs/Progress.md: the library clamps the value to 0…max instead, so -20 reads as 0)", () => {});

    it.skip("console.errors the invalid prop it corrected (the library corrects value and max silently)", () => {});
  });

  describe("composition", () => {
    // radix progress.tsx spreads `...progressProps` after the aria and data
    // attributes, so a caller can override any of them.
    it("lets a caller's props override the attributes it computed", () => {
      const r = bar({ value: 50, role: "meter", "data-state": "custom" });
      expect(r.root.getAttribute("role")).toBe("meter");
      expect(r.root.getAttribute("data-state")).toBe("custom");
    });

    // radix progress.tsx ProgressIndicator spreads `...indicatorProps` last too.
    it("lets a caller's props override the indicator's attributes", () => {
      const r = render(h(Progress, { value: 50 }, h(Progress.Indicator, { "data-state": "custom" })));
      expect(indicator(r).getAttribute("data-state")).toBe("custom");
    });

    // radix progress.test.tsx "spreads props it does not consume onto the
    // element it renders" for both the root and the indicator.
    it("spreads className, id and onClick onto the root", () => {
      const onClick = vi.fn();
      const r = render(h(Progress, { value: 50, id: "upload", className: "custom-class", onClick }));
      expect(r.root.getAttribute("id")).toBe("upload");
      expect(r.root.classList.contains("custom-class")).toBe(true);
      click(r.root);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("renders the indicator inside the track", () => {
      const r = bar({ value: 50 });
      expect(indicator(r).parentElement).toBe(r.root);
    });

    // radix progress.tsx useProgressContext throws when an indicator is used
    // outside a Progress; ProgressContext here has a default value instead.
    it.skip("throws when Progress.Indicator is rendered outside a Progress (the library's context defaults to an indeterminate value, so a stray indicator renders as indeterminate)", () => {});
  });
});
