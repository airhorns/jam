// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction, observable } from "mobx";
import { h } from "@jam/core/jsx";
import { render, click, css, setupDefaultUI } from "../../testing";
import { Avatar } from "../../components/Avatar";
import { Text } from "../../components/Text";

beforeEach(() => {
  setupDefaultUI();
});

// happy-dom never fetches an <img>, so its load/error events are dispatched by
// hand; a real browser fires the same events at the same element.
const load = (img: Element) => img.dispatchEvent(new Event("load"));
const fail = (img: Element) => img.dispatchEvent(new Event("error"));
const hidden = (img: Element) => css(img).display === "none";

describe("Avatar conformance", () => {
  describe("structure and props", () => {
    // radix avatar.test.tsx Avatar.Root "spreads props it does not consume onto
    // the element it renders".
    it("spreads props it does not consume onto the frame, including onClick", () => {
      const onClick = vi.fn();
      const r = render(h(Avatar, { id: "ada", className: "custom-class", "data-testid": "root", onClick }));
      expect(r.root.getAttribute("id")).toBe("ada");
      expect(r.root.classList.contains("custom-class")).toBe(true);
      expect(r.root.getAttribute("data-testid")).toBe("root");
      click(r.root);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    // radix avatar.test.tsx Avatar.Image "spreads props it does not consume
    // onto the element it renders"; avatar.tsx also hands referrerPolicy and
    // crossOrigin to the request, which here is the rendered img's own.
    it("spreads src, alt, referrerPolicy and crossOrigin onto the img", () => {
      const r = render(
        h(Avatar, null, h(Avatar.Image, { src: "/ada.jpg", alt: "Ada", referrerPolicy: "no-referrer", crossOrigin: "anonymous" })),
      );
      const img = r.get<HTMLImageElement>("img");
      expect(img.getAttribute("src")).toBe("/ada.jpg");
      expect(img.getAttribute("alt")).toBe("Ada");
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
      expect(img.getAttribute("crossorigin")).toBe("anonymous");
    });

    // docs/Avatar.md: 'Use alt="" when the avatar is decorative'; an empty alt
    // must survive as an empty attribute, not be dropped.
    it("keeps an empty alt so a decorative avatar stays out of the accessible tree", () => {
      const r = render(h(Avatar, null, h(Avatar.Image, { src: "/ada.jpg", alt: "" })));
      expect(r.get("img").getAttribute("alt")).toBe("");
    });

    // radix avatar.tsx AvatarFallback destructures `delayMs` out of the props
    // it spreads, so it never reaches the DOM.
    it("consumes delayMs on the fallback instead of rendering it", () => {
      const r = render(h(Avatar, null, h(Avatar.Fallback, { delayMs: 600 }, "AL")));
      const fallback = r.get(".is_AvatarFallback");
      expect(fallback.hasAttribute("delayMs")).toBe(false);
      expect(fallback.hasAttribute("delayms")).toBe(false);
    });

    // radix avatar.tsx renders Primitive.span for the root: no role, not
    // focusable. docs/Avatar.md: "The frame has no role and is not focusable".
    it("gives the frame no role and no tab stop", () => {
      const r = render(h(Avatar, null, h(Avatar.Fallback, null, "AL")));
      expect(r.root.hasAttribute("role")).toBe(false);
      expect(r.root.hasAttribute("tabindex")).toBe(false);
    });
  });

  describe("what shows while the image loads", () => {
    // radix avatar.test.tsx "should render the fallback initially": before the
    // image reports anything, the fallback is what you see. Avatar.ts gets
    // there by layering the fallback under the image (z-index 0 vs 1) rather
    // than mounting it conditionally.
    it("shows the fallback before the image has loaded", () => {
      const r = render(h(Avatar, null, h(Avatar.Image, { src: "/ada.jpg" }), h(Avatar.Fallback, null, "AL")));
      const fallback = r.get(".is_AvatarFallback");
      expect(fallback.textContent).toBe("AL");
      expect(css(fallback)["z-index"]).toBe("0");
      expect(css(r.get("img"))["z-index"]).toBe("1");
    });

    // radix avatar.test.tsx "given an Avatar with fallback and no image":
    // the fallback renders on its own.
    it("shows the fallback when there is no image at all", () => {
      const r = render(h(Avatar, null, h(Avatar.Fallback, null, h(Text, null, "AL"))));
      expect(r.query("img")).toBeNull();
      expect(r.get(".is_AvatarFallback").textContent).toBe("AL");
    });

    // radix avatar.test.tsx "should render the image after it has loaded".
    it("shows the image once it loads", () => {
      const r = render(h(Avatar, null, h(Avatar.Image, { src: "/ada.jpg" }), h(Avatar.Fallback, null, "AL")));
      load(r.get("img"));
      expect(hidden(r.get("img"))).toBe(false);
    });

    // radix avatar.test.tsx "should render the fallback again after a loaded
    // image unmounts": removing the image brings the fallback back.
    it("still shows the fallback after the image leaves the tree", () => {
      const show = observable.box(true);
      const Frame = () =>
        h(Avatar, null, show.get() ? h(Avatar.Image, { src: "/ada.jpg" }) : null, h(Avatar.Fallback, null, "AL"));
      const r = render(h(Frame, null));
      load(r.get("img"));
      runInAction(() => show.set(false));
      expect(r.query("img")).toBeNull();
      expect(r.get(".is_AvatarFallback").textContent).toBe("AL");
    });

    it.skip("keeps the image out of the DOM until it has loaded (the library layers the image over the fallback instead of mounting it only once loaded)", () => {});

    it.skip("renders no image when src is missing or an empty string (the library always renders the img and lets the fallback show through)", () => {});

    it.skip("treats a loaded image whose naturalWidth is 0 as an error (the library only reacts to the img's error event, which happy-dom cannot raise for a sizeless image)", () => {});

    it.skip("reports loading status through onLoadingStatusChange, never with 'idle' (the library has no onLoadingStatusChange)", () => {});

    it.skip("holds the fallback back for delayMs before showing it (docs/Avatar.md: delayMs is accepted for API parity and ignored)", () => {});

    it.skip("warns when more than one Avatar.Image is rendered per Avatar (the library has no development-only image count)", () => {});
  });

  describe("an image that fails", () => {
    // docs/Avatar.md: a src that fails "switches to display: none, so the
    // browser's placeholder glyph never covers the fallback".
    it("takes a broken image out of the layout so the fallback shows through", () => {
      const r = render(h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg" }), h(Avatar.Fallback, null, "AL")));
      expect(hidden(r.get("img"))).toBe(false);
      fail(r.get("img"));
      expect(hidden(r.get("img"))).toBe(true);
      expect(r.get(".is_AvatarFallback").textContent).toBe("AL");
    });

    // docs/Avatar.md: "Your own onError still runs."
    it("still calls a caller's onError", () => {
      const onError = vi.fn();
      const r = render(h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg", onError })));
      fail(r.get("img"));
      expect(onError).toHaveBeenCalledTimes(1);
    });

    // radix avatar.test.tsx "can handle changing src": the new src is loaded
    // afresh, so a failure of the old one does not stick.
    it("paints again when the src changes after a failure", () => {
      const src = observable.box("/missing.jpg");
      const Frame = () => h(Avatar, null, h(Avatar.Image, { src: src.get() }), h(Avatar.Fallback, null, "AL"));
      const r = render(h(Frame, null));
      fail(r.get("img"));
      expect(hidden(r.get("img"))).toBe(true);
      runInAction(() => src.set("/ada.jpg"));
      expect(r.get("img").getAttribute("src")).toBe("/ada.jpg");
      expect(hidden(r.get("img"))).toBe(false);
    });

    // Avatar.ts keys the failure on the src, so going back to one that already
    // failed stays hidden. Radix re-requests it and ends up in the same place.
    it("stays hidden when the src goes back to one that already failed", () => {
      const src = observable.box("/missing.jpg");
      const Frame = () => h(Avatar, null, h(Avatar.Image, { src: src.get() }), h(Avatar.Fallback, null, "AL"));
      const r = render(h(Frame, null));
      fail(r.get("img"));
      runInAction(() => src.set("/ada.jpg"));
      runInAction(() => src.set("/missing.jpg"));
      expect(hidden(r.get("img"))).toBe(true);
    });

    // radix avatar.tsx scopes the loading status to one Avatar provider, so one
    // avatar's failure never hides another's image.
    it("keeps each avatar's failure to itself", () => {
      const r = render(
        h(
          "div",
          null,
          h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg" }), h(Avatar.Fallback, null, "A")),
          h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg" }), h(Avatar.Fallback, null, "B")),
        ),
      );
      const [first, second] = r.all("img");
      fail(first);
      expect(hidden(first)).toBe(true);
      expect(hidden(second)).toBe(false);
    });

    // useControllableState (state.ts) forgets a component's state on unmount,
    // so a remount of the same avatar starts by showing the image again.
    it("forgets the failure when the avatar unmounts and mounts again", () => {
      const first = render(h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg" }), h(Avatar.Fallback, null, "AL")));
      fail(first.get("img"));
      expect(hidden(first.get("img"))).toBe(true);
      const second = render(h(Avatar, null, h(Avatar.Image, { src: "/missing.jpg" }), h(Avatar.Fallback, null, "AL")));
      expect(hidden(second.get("img"))).toBe(false);
    });
  });
});
