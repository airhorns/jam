// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, css, focus, keydown, injectedRules, setupDefaultUI } from "../../testing";
import { ScrollView } from "../../components/ScrollView";
import { Text } from "../../components/Text";
import { Square } from "../../components/Shapes";

beforeEach(() => {
  setupDefaultUI();
});

describe("ScrollView conformance", () => {
  describe("the overflow container", () => {
    // radix scroll-area.tsx ScrollAreaViewport: overflowY is scrollable when
    // the vertical scrollbar is enabled and `hidden` otherwise, so exactly one
    // axis scrolls and the other is clipped. ScrollView uses `auto` because it
    // keeps the browser's own scrollbars rather than rendering its own.
    it("scrolls the vertical axis and clips the horizontal one by default", () => {
      const r = render(h(ScrollView, { height: 100 }, h(Text, null, "content")));
      expect(css(r.root)).toMatchObject({ "overflow-y": "auto", "overflow-x": "hidden" });
    });

    it("swaps the axes when horizontal is set", () => {
      const r = render(h(ScrollView, { horizontal: true, width: 100 }));
      expect(css(r.root)).toMatchObject({ "overflow-x": "auto", "overflow-y": "hidden" });
    });

    // A horizontal scroller lays its children out along the scrolling axis;
    // radix leaves that to the consumer's content, ScrollView owns it.
    it("lays children out in a row when horizontal and a column otherwise", () => {
      expect(css(render(h(ScrollView, { horizontal: true })).root)["flex-direction"]).toBe("row");
      expect(css(render(h(ScrollView, null)).root)["flex-direction"]).toBe("column");
    });

    // docs/ScrollView.md: unstyled "drops the overflow and direction defaults".
    it("drops the overflow entirely when unstyled", () => {
      const r = render(h(ScrollView, { unstyled: true }));
      expect(css(r.root)["overflow-y"]).toBeUndefined();
      expect(css(r.root)["overflow-x"]).toBeUndefined();
    });

    // radix scroll-area.tsx ScrollAreaViewportStyle:
    // `[data-radix-scroll-area-viewport]{scrollbar-width:none;…}`
    it("hides the native scrollbar with scrollbar-width when showsScrollIndicator is false", () => {
      expect(css(render(h(ScrollView, { showsScrollIndicator: false })).root)["scrollbar-width"]).toBe("none");
      expect(css(render(h(ScrollView, null)).root)["scrollbar-width"]).toBeUndefined();
    });

    // docs/ScrollView.md: false "hides the scrollbar without disabling
    // scrolling", which is also why Radix hides the bars in CSS rather than
    // setting overflow to hidden.
    it("keeps scrolling enabled while the scrollbar is hidden", () => {
      const r = render(h(ScrollView, { showsScrollIndicator: false, height: 100 }));
      expect(css(r.root)["overflow-y"]).toBe("auto");
    });

    it.skip("also hides the WebKit and legacy-Edge scrollbars (radix's viewport style adds ::-webkit-scrollbar{display:none} and -ms-overflow-style:none; the style system only emits declarations for the element itself)", () => {});

    it.skip("enables momentum scrolling on touch with -webkit-overflow-scrolling (same reason: no place for a raw pseudo-class-free vendor rule on the element)", () => {});
  });

  describe("scroll position and events", () => {
    // radix scroll-area.tsx subscribes to the viewport's `scroll` event to move
    // its thumb; a plain overflow container exposes the same event.
    it("calls onScroll with the scroller as the event target", () => {
      const onScroll = vi.fn();
      const r = render(h(ScrollView, { onScroll, height: 100 }));
      r.root.dispatchEvent(new Event("scroll"));
      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onScroll.mock.calls[0][0].target).toBe(r.root);
    });

    // The scroll position lives on the element, so imperative scrolling works
    // without any component state (radix's thumb drag sets viewport.scrollTop
    // the same way).
    it("scrolls to a position set on the element", () => {
      const r = render(h(ScrollView, { height: 100 }));
      r.root.scrollTop = 40;
      expect(r.root.scrollTop).toBe(40);
    });

    it.skip("scrolls when the arrow keys or Page keys are pressed in a focused region (happy-dom implements no scrolling default action for keys)", () => {});

    it.skip("hides its scrollbars after scrollHideDelay for type=\"hover\"/\"scroll\" (the library has no custom scrollbars, so it has no type or scrollHideDelay)", () => {});
  });

  describe("accessibility", () => {
    // WAI-ARIA APG: a scrollable region that scrolls independently is a labelled
    // `region` so a screen reader user can find it and its label says what it
    // holds.
    it("passes role and an accessible name through", () => {
      const r = render(h(ScrollView, { role: "region", "aria-label": "Messages", height: 100 }));
      expect(r.root.getAttribute("role")).toBe("region");
      expect(r.root.getAttribute("aria-label")).toBe("Messages");
    });

    // docs/ScrollView.md: "A scrollable div with no tabIndex is not
    // keyboard-scrollable in every browser. Add tabIndex={0} (and a label) when
    // the region scrolls independently."
    it("becomes a tab stop when the caller gives it a tabIndex", () => {
      const r = render(h(ScrollView, { tabIndex: 0, role: "region", "aria-label": "Messages" }));
      expect(r.root.getAttribute("tabindex")).toBe("0");
      focus(r.root);
      expect(document.activeElement).toBe(r.root);
    });

    // radix scroll-area.tsx puts no tabIndex on its viewport either: whether a
    // scroll region is a tab stop is the consumer's call.
    it("adds no tabIndex of its own", () => {
      const r = render(h(ScrollView, { height: 100 }, h(Text, null, "content")));
      expect(r.root.hasAttribute("tabindex")).toBe(false);
    });

    // A scroll container must not swallow keys it does not handle, so a key
    // pressed inside it still reaches the page.
    it("does not preventDefault the keys pressed inside it", () => {
      const r = render(h(ScrollView, { tabIndex: 0 }, h(Text, null, "content")));
      for (const key of ["ArrowDown", "PageDown", "Home", " "]) {
        expect(keydown(r.root, key).defaultPrevented).toBe(false);
      }
    });

    // radix scroll-area.tsx renders `dir` on its root and feeds it to the
    // scrollbar maths so a horizontal scroller starts at the reading edge.
    it("renders a dir attribute when it is given one", () => {
      expect(render(h(ScrollView, { horizontal: true, dir: "rtl" })).root.getAttribute("dir")).toBe("rtl");
    });

    it.skip("always reflects a direction, defaulting to ltr (radix's ScrollArea root resolves `dir` through useDirection; the library only renders the attribute when the caller passes one)", () => {});
  });

  describe("content", () => {
    // radix scroll-area.tsx wraps the viewport's children in an implicit
    // ScrollAreaContent (`display: table`) to measure them; ScrollView has no
    // parts, so children are its own flex children.
    it("renders its children directly, with no content wrapper element", () => {
      const r = render(h(ScrollView, null, h(Square, { size: "$4" }), h(Square, { size: "$4" })));
      const squares = r.all(".is_Square");
      expect(squares).toHaveLength(2);
      expect(squares[0].parentElement).toBe(r.root);
    });

    // docs/ScrollView.md Parts: "None - it is a single styled Stack, so gap,
    // padding and alignItems apply directly to its children."
    it("applies gap and padding to the scroller itself", () => {
      const r = render(h(ScrollView, { gap: "$2", padding: "$3" }, h(Text, null, "content")));
      expect(css(r.root).gap).toBeDefined();
      expect(css(r.root).padding).toBeDefined();
    });

    it("spreads the props it does not consume onto the scroller, including onClick", () => {
      const onClick = vi.fn();
      const r = render(h(ScrollView, { id: "messages", className: "custom-class", onClick }));
      expect(r.root.getAttribute("id")).toBe("messages");
      expect(r.root.classList.contains("custom-class")).toBe(true);
      click(r.root);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it.skip("styles the content container separately through contentContainerStyle (there is no content element to style; put the padding and gap on the ScrollView itself)", () => {});

    // radix scroll-area.tsx renders Scrollbar/Thumb/Corner parts over the
    // viewport, none of which the library has.
    it("emits no scrollbar or thumb elements of its own", () => {
      const r = render(h(ScrollView, { height: 100 }, h(Text, null, "content")));
      expect(r.root.children).toHaveLength(1);
      expect(injectedRules().some((rule) => rule.includes("scroll-area"))).toBe(false);
    });
  });
});
