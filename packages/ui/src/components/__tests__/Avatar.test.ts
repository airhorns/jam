// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Avatar } from "../Avatar";

beforeEach(() => {
  setupDefaultUI();
});

describe("Avatar", () => {
  it("is a fixed-size frame that clips its content", () => {
    const r = render(h(Avatar, { size: "$6" }));
    expect(r.root.classList.contains("is_Avatar")).toBe(true);
    expect(css(r.root)).toMatchObject({
      width: "64px",
      height: "64px",
      overflow: "hidden",
      position: "relative",
      "background-color": "var(--background)",
    });
  });

  it("defaults to the true size and can be circular", () => {
    expect(css(render(h(Avatar, null)).root).width).toBe("44px");
    const circle = render(h(Avatar, { circular: true, size: "$6" }));
    expect(css(circle.root)).toMatchObject({ "border-radius": "100000px", width: "64px" });
  });

  it("Image covers the frame", () => {
    const r = render(h(Avatar, { size: "$6" }, h(Avatar.Image, { src: "/a.png", alt: "Ada" })));
    const img = r.get<HTMLImageElement>("img");
    expect(img.getAttribute("src")).toBe("/a.png");
    expect(img.getAttribute("alt")).toBe("Ada");
    expect(css(img)).toMatchObject({
      position: "absolute",
      width: "100%",
      height: "100%",
      "object-fit": "cover",
      "z-index": "1",
    });
  });

  it("an image that fails to load hides itself so the fallback shows", () => {
    let errors = 0;
    const r = render(
      h(
        Avatar,
        { size: "$6" },
        h(Avatar.Image, { src: "/missing.png", onError: () => errors++ }),
        h(Avatar.Fallback, null, "AL"),
      ),
    );
    expect(css(r.get("img")).display).toBeUndefined();
    r.get("img").dispatchEvent(new Event("error"));
    expect(errors).toBe(1);
    expect(css(r.get("img")).display).toBe("none");
  });

  it("Fallback sits behind the image and centres its content", () => {
    const r = render(h(Avatar, { size: "$6" }, h(Avatar.Fallback, { delayMs: 600 }, "AL")));
    const fallback = r.get(".is_AvatarFallback");
    expect(fallback.textContent).toBe("AL");
    expect(fallback.hasAttribute("delayMs")).toBe(false);
    expect(css(fallback)).toMatchObject({
      position: "absolute",
      "align-items": "center",
      "justify-content": "center",
      "background-color": "var(--background)",
      "z-index": "0",
    });
  });

  it("the fallback can be themed on its own", () => {
    const r = render(h(Avatar, { size: "$6" }, h(Avatar.Fallback, { backgroundColor: "$blue9" }, "AL")));
    expect(css(r.get(".is_AvatarFallback"))["background-color"]).toBe("var(--blue9)");
  });

  it("unstyled drops the frame size and background", () => {
    const r = render(h(Avatar, { unstyled: true }));
    expect(css(r.root).width).toBeUndefined();
    expect(css(r.root)["background-color"]).toBeUndefined();
  });
});
