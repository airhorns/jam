// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Image } from "../Image";

beforeEach(() => {
  setupDefaultUI();
});

describe("Image", () => {
  it("renders an img with its source and alt text", () => {
    const r = render(h(Image, { src: "/photo.jpg", alt: "A photo", width: 200, height: 100 }));
    expect(r.root.tagName).toBe("IMG");
    expect(r.root.classList.contains("is_Image")).toBe(true);
    expect(r.root.getAttribute("src")).toBe("/photo.jpg");
    expect(r.root.getAttribute("alt")).toBe("A photo");
    expect(css(r.root)).toMatchObject({ width: "200px", height: "100px", display: "block", "object-fit": "cover" });
  });

  it("objectFit is a plain style prop", () => {
    expect(css(render(h(Image, { src: "/a.jpg", objectFit: "contain" })).root)["object-fit"]).toBe("contain");
    expect(css(render(h(Image, { src: "/a.jpg", objectFit: "none" })).root)["object-fit"]).toBe("none");
  });

  it("maps resizeMode onto object-fit", () => {
    const mapping: Array<[string, string]> = [
      ["cover", "cover"],
      ["contain", "contain"],
      ["stretch", "fill"],
      ["center", "none"],
    ];
    for (const [resizeMode, objectFit] of mapping) {
      const r = render(h(Image, { src: "/a.jpg", resizeMode }));
      expect(css(r.root)["object-fit"]).toBe(objectFit);
      expect(r.root.hasAttribute("resizeMode")).toBe(false);
    }
  });

  it("takes size and radius tokens", () => {
    const r = render(h(Image, { src: "/a.jpg", width: "$6", height: "$6", borderRadius: "$4" }));
    expect(css(r.root)).toMatchObject({ width: "64px", height: "64px", "border-radius": "9px" });
  });
});
