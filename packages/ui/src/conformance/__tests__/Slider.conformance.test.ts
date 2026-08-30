// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, keydown, setupDefaultUI } from "../../testing";
import { Slider } from "../../components/Slider";

beforeEach(() => {
  setupDefaultUI();
});

function renderSlider(props: Record<string, unknown> = {}, thumbCount = 1) {
  return render(
    h(
      Slider,
      props as never,
      h(Slider.Track, { key: "track", "data-testid": "track" }, h(Slider.TrackActive, { key: "active", "data-testid": "active" })),
      ...Array.from({ length: thumbCount }, (_, i) =>
        h(Slider.Thumb, { key: i, index: i, "aria-label": `Thumb ${i}` }),
      ),
    ),
  );
}

const thumbsOf = (r: ReturnType<typeof render>) => r.all("[role=slider]");

describe("Slider conformance", () => {
  describe("keyboard", () => {
    // Radix slider.tsx:262-264: isSkipKey = isPageKey || (event.shiftKey && ARROW_KEYS.includes(event.key)); multiplier 10.
    it("Shift+Arrow steps by 10x like Radix's isSkipKey (slider.tsx:262-264)", () => {
      const r = renderSlider({ defaultValue: 50 });
      const thumb = () => thumbsOf(r)[0];
      keydown(thumb(), "ArrowRight", { shiftKey: true });
      expect(thumb().getAttribute("aria-valuenow")).toBe("60");
      keydown(thumb(), "ArrowLeft", { shiftKey: true });
      keydown(thumb(), "ArrowLeft", { shiftKey: true });
      expect(thumb().getAttribute("aria-valuenow")).toBe("40");
    });

    // Radix's own Slider component hardcodes Home to atIndex 0 and End to values.length-1
    // regardless of which thumb has focus (slider.tsx:247-258). The WAI-ARIA APG
    // multi-thumb slider pattern instead has Home/End act on the *focused* thumb's own
    // clamped bounds. Ours follows the APG pattern, not Radix's literal source.
    it("Home moves the focused thumb to its own clamped minimum, not always the first thumb (APG multi-thumb slider; diverges from Radix slider.tsx:247-252's hardcoded atIndex=0)", () => {
      const r = renderSlider({ defaultValue: [20, 60] }, 2);
      const [thumb0, thumb1] = thumbsOf(r);
      keydown(thumb1, "Home");
      expect(thumbsOf(r)[1].getAttribute("aria-valuenow")).toBe("20");
      expect(thumbsOf(r)[0].getAttribute("aria-valuenow")).toBe("20");
    });

    it("End moves the focused thumb to its own clamped maximum, not always the last thumb (APG multi-thumb slider; diverges from Radix slider.tsx:253-258's hardcoded atIndex=values.length-1)", () => {
      const r = renderSlider({ defaultValue: [20, 60] }, 2);
      const [thumb0] = thumbsOf(r);
      keydown(thumb0, "End");
      expect(thumbsOf(r)[0].getAttribute("aria-valuenow")).toBe("60");
      expect(thumbsOf(r)[1].getAttribute("aria-valuenow")).toBe("60");
    });

    // Radix commits (fires onValueCommit) from onHomeKeyDown/onEndKeyDown too (slider.tsx:247-258),
    // not only from onStepKeyDown.
    it("onSlideEnd (our onValueCommit analogue) fires on Home and End, not only Arrow/Page", () => {
      const onSlideEnd = vi.fn();
      const r = renderSlider({ defaultValue: 50, onSlideEnd });
      const thumb = () => thumbsOf(r)[0];
      keydown(thumb(), "Home");
      expect(onSlideEnd).toHaveBeenCalledWith([0]);
      onSlideEnd.mockClear();
      keydown(thumb(), "End");
      expect(onSlideEnd).toHaveBeenCalledWith([100]);
    });

    // Radix flips which arrow key is "back" via useDirection(dir) + BACK_KEYS (slider.tsx:341-343, 384-388).
    // In RTL (not inverted), 'from-right' back-keys are Home/PageDown/ArrowDown/ArrowRight, so
    // ArrowLeft becomes the *forward* key and should increase the value.
    it("dir=\"rtl\" passes through as a real attribute, and flips arrow-key direction like Radix's useDirection (slider.tsx:341-343, 384-388)", () => {
      const r = render(h(Slider, { dir: "rtl", defaultValue: 50 } as never, h(Slider.Thumb, { "aria-label": "Volume" })));
      expect(r.root.getAttribute("dir")).toBe("rtl");
      const thumb = r.get("[role=slider]");
      keydown(thumb, "ArrowLeft");
      expect(thumb.getAttribute("aria-valuenow")).toBe("51");
    });

    // Radix's `inverted` prop flips isSlidingFromLeft independently of dir (slider.tsx:107,127,343).
    // LTR + inverted=true -> slideDirection 'from-right' -> ArrowRight becomes the *back* key.
    it("`inverted` prop flips arrow-key direction (Radix slider.tsx:107,127,343)", () => {
      const r = render(h(Slider, { inverted: true, defaultValue: 50 } as never, h(Slider.Thumb, { "aria-label": "Volume" })));
      const thumb = r.get("[role=slider]");
      keydown(thumb, "ArrowRight");
      expect(thumb.getAttribute("aria-valuenow")).toBe("49");
    });
  });

  describe("range clamping", () => {
    // Radix's own default (preserveThumbOrder=false) lets a thumb cross and swap with its
    // neighbour (values array is re-sorted, slider.tsx:190-212). Ours never crosses — it always
    // clamps to the neighbour's current value, matching preserveThumbOrder=true + gap 0.
    it("a thumb stepped repeatedly clamps exactly at its neighbour's current value and never crosses it (deliberate divergence from Radix's default crossing behaviour, slider.tsx:190-212)", () => {
      const r = renderSlider({ defaultValue: [20, 60] }, 2);
      const thumb0 = () => thumbsOf(r)[0];
      for (let i = 0; i < 50; i++) keydown(thumb0(), "ArrowRight");
      expect(thumbsOf(r)[0].getAttribute("aria-valuenow")).toBe("60");
      expect(thumbsOf(r)[1].getAttribute("aria-valuenow")).toBe("60");
    });

    // Radix supports a configurable minimum gap between thumbs (slider.tsx:94,121,186,938-945).
    // With minStepsBetweenThumbs=5 and values [20, 25], moving thumb 0 even one step to 21 would
    // leave a gap of only 4, so Radix's hasMinStepsBetweenValues check blocks the move entirely —
    // thumb 0 should stay at 20 no matter how many times ArrowRight is pressed.
    it("minStepsBetweenThumbs blocks a move that would violate the gap (Radix slider.tsx:94,121,186,938-945)", () => {
      const r = renderSlider({ defaultValue: [20, 25], minStepsBetweenThumbs: 5 } as never, 2);
      const thumb0 = () => thumbsOf(r)[0];
      for (let i = 0; i < 5; i++) keydown(thumb0(), "ArrowRight");
      expect(thumbsOf(r)[0].getAttribute("aria-valuenow")).toBe("20");
    });
  });

  describe("aria / data attributes", () => {
    // Radix sets aria-disabled={disabled} unconditionally, i.e. "false" when enabled (slider.tsx:231).
    it("aria-disabled is present (\"false\") when enabled, like Radix (slider.tsx:231)", () => {
      const r = renderSlider({ defaultValue: 50 });
      expect(r.root.getAttribute("aria-disabled")).toBe("false");
    });

    // Radix: aria-disabled={disabled} -> "true", and data-disabled={''} (empty string) when disabled (slider.tsx:231-232).
    it("aria-disabled is \"true\" and data-disabled is the empty string when disabled, like Radix (slider.tsx:231-232)", () => {
      const r = renderSlider({ defaultValue: 50, disabled: true });
      expect(r.root.getAttribute("aria-disabled")).toBe("true");
      expect(r.root.getAttribute("data-disabled")).toBe("");
    });

    // Radix SliderTrack sets both data-orientation and data-disabled (slider.tsx:563-564).
    it("Slider.Track carries data-orientation/data-disabled, like Radix (slider.tsx:563-564)", () => {
      const r = renderSlider({ defaultValue: 50, disabled: true, orientation: "vertical" });
      const track = r.get("[data-testid=track]");
      expect(track.getAttribute("data-orientation")).toBe("vertical");
      expect(track.getAttribute("data-disabled")).toBe("");
    });

    // Radix SliderRange (our TrackActive) sets both data-orientation and data-disabled (slider.tsx:597-598).
    it("Slider.TrackActive carries data-orientation/data-disabled, like Radix (slider.tsx:597-598)", () => {
      const r = renderSlider({ defaultValue: 50, disabled: true, orientation: "vertical" });
      const active = r.get("[data-testid=active]");
      expect(active.getAttribute("data-orientation")).toBe("vertical");
      expect(active.getAttribute("data-disabled")).toBe("");
    });

    // Radix SliderThumb sets both data-orientation and data-disabled on every thumb (slider.tsx:741-742).
    it("Slider.Thumb carries data-orientation/data-disabled, like Radix (slider.tsx:741-742)", () => {
      const r = renderSlider({ defaultValue: 50, disabled: true, orientation: "vertical" });
      const thumb = r.get("[role=slider]");
      expect(thumb.getAttribute("data-orientation")).toBe("vertical");
      expect(thumb.getAttribute("data-disabled")).toBe("");
    });

    // APG slider pattern: aria-orientation reflects the slider's orientation on every thumb.
    it("aria-orientation is present on every thumb, including the vertical case", () => {
      const r = renderSlider({ orientation: "vertical", defaultValue: 25 });
      expect(r.get("[role=slider]").getAttribute("aria-orientation")).toBe("vertical");
    });

    it("arbitrary aria-* attributes pass through onto Slider.Thumb's DOM button via styled() prop passthrough", () => {
      const r = render(
        h(Slider, { defaultValue: 30 } as never, h(Slider.Thumb, { "aria-label": "Volume", "aria-valuetext": "30 percent" })),
      );
      const thumb = r.get("[role=slider]");
      expect(thumb.getAttribute("aria-label")).toBe("Volume");
      expect(thumb.getAttribute("aria-valuetext")).toBe("30 percent");
    });
  });

  describe("form integration", () => {
    // Radix renders a hidden SliderBubbleInput per thumb mirroring name/value/form (slider.tsx:787-791, 810-859),
    // so a slider with a `name` inside a <form> should contribute a FormData entry with its value.
    it("a named slider contributes a FormData entry, like Radix's SliderBubbleInput (slider.tsx:787-791, 849-857)", () => {
      const r = render(
        h("form", {}, h(Slider, { name: "volume", defaultValue: 40 } as never, h(Slider.Thumb, { "aria-label": "Volume" }))),
      );
      const form = r.get<HTMLFormElement>("form");
      const data = new FormData(form);
      expect(data.get("volume")).toBe("40");
    });

    // Radix registers a `reset` listener on the owning form that restores the values captured
    // on first mount (slider.tsx:154-164), so the value should revert to its initial default.
    it("dispatching reset on the owning form restores the initial value, like Radix (slider.tsx:154-164)", () => {
      const r = render(
        h("form", {}, h(Slider, { defaultValue: 20 } as never, h(Slider.Thumb, { "aria-label": "Volume" }))),
      );
      const thumb = r.get("[role=slider]");
      keydown(thumb, "ArrowRight");
      expect(thumb.getAttribute("aria-valuenow")).toBe("21");
      const form = r.get<HTMLFormElement>("form");
      form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
      expect(r.get("[role=slider]").getAttribute("aria-valuenow")).toBe("20");
    });
  });

  describe("focus / tab order", () => {
    // Radix sets tabIndex={context.disabled ? undefined : 0} on a <span role="slider"> (slider.tsx:743).
    // Ours is a real <button>, which is a tab stop by default with no explicit tabIndex — same outcome.
    it("a non-disabled thumb is a tab stop (tabIndex 0), matching the outcome of Radix's explicit tabIndex={0} (slider.tsx:743)", () => {
      const r = renderSlider({ defaultValue: 50 });
      const thumb = r.get<HTMLButtonElement>("[role=slider]");
      expect(thumb.tabIndex).toBe(0);
    });

    // happy-dom's `.tabIndex` getter does not account for `disabled` (always reports 0), so we
    // assert the real outcome instead: `.focus()` is a no-op on a disabled button, which
    // happy-dom does implement correctly, matching Radix's un-tabbable disabled span.
    it("a disabled thumb cannot receive focus, matching the outcome of Radix's tabIndex={undefined} on an un-tabbable span (slider.tsx:743)", () => {
      const r = renderSlider({ defaultValue: 50, disabled: true });
      const thumb = r.get<HTMLButtonElement>("[role=slider]");
      thumb.focus();
      expect(document.activeElement).not.toBe(thumb);
    });
  });
});
