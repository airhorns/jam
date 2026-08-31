// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, $ } from "../db";
import { replace, when } from "../primitives";
import { h } from "../jsx";
import { mount } from "../renderer";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

let container: HTMLElement;
let unmount: (() => void) | null = null;

beforeEach(() => {
  db.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  unmount?.();
  unmount = null;
  container.remove();
});

describe("mount: SVG", () => {
  it("creates svg elements in the SVG namespace and html inside foreignObject in the XHTML namespace", () => {
    const Icon = () =>
      h(
        "svg",
        { viewBox: "0 0 24 24", width: 16, class: "icon" },
        h("path", { d: "M1 1h22v22H1z", "stroke-width": 2 }),
        h("foreignObject", { x: 0, y: 0, width: 10, height: 10 }, h("div", { class: "inner" }, "hi")),
      );
    unmount = mount(h(Icon, null), container);

    const svg = container.querySelector("svg")!;
    const path = container.querySelector("path")!;
    const fo = container.querySelector("foreignObject")!;
    const div = container.querySelector("div.inner")!;

    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(path.namespaceURI).toBe(SVG_NS);
    expect(fo.namespaceURI).toBe(SVG_NS);
    expect(fo.localName).toBe("foreignObject");
    expect(div.namespaceURI).toBe(XHTML_NS);

    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("class")).toBe("icon");
    expect(path.getAttribute("d")).toBe("M1 1h22v22H1z");
    expect(path.getAttribute("stroke-width")).toBe("2");
    expect(div.textContent).toBe("hi");
  });

  it("keeps svg node identity across patches and updates attributes in place", () => {
    replace("icon", "color", "red");
    const Icon = () => {
      const [{ color }] = when(["icon", "color", $.color]);
      return h("svg", { viewBox: "0 0 10 10" }, h("circle", { r: 4, fill: color }), h("foreignObject", null, h("span", null, color)));
    };
    unmount = mount(h(Icon, null), container);

    const svg = container.querySelector("svg")!;
    const circle = container.querySelector("circle")!;
    const fo = container.querySelector("foreignObject")!;
    expect(circle.getAttribute("fill")).toBe("red");

    replace("icon", "color", "blue");
    expect(container.querySelector("svg")).toBe(svg);
    expect(container.querySelector("circle")).toBe(circle);
    expect(container.querySelector("foreignObject")).toBe(fo);
    expect(circle.getAttribute("fill")).toBe("blue");
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
    expect(container.querySelector("span")!.textContent).toBe("blue");
  });

  it("does not reuse an html element for an svg tag of the same name", () => {
    replace("mode", "svg", false);
    const Root = () => {
      const [{ on }] = when(["mode", "svg", $.on]);
      return h("div", null, on ? h("svg", null, h("a", { href: "#" }, "svg link")) : h("a", { href: "#" }, "html link"));
    };
    unmount = mount(h(Root, null), container);
    const htmlA = container.querySelector("a")!;
    expect(htmlA.namespaceURI).toBe(XHTML_NS);

    replace("mode", "svg", true);
    const svgA = container.querySelector("svg a")!;
    expect(svgA.namespaceURI).toBe(SVG_NS);
    expect(svgA).not.toBe(htmlA);
  });
});

describe("mount: html", () => {
  it("still applies value/checked/disabled as properties and other props as attributes", () => {
    replace("form", "done", true);
    const Form = () => {
      const [{ done }] = when(["form", "done", $.done]);
      return h("label", null, h("input", { type: "checkbox", checked: done, disabled: !done, "data-id": 7 }), h("input", { type: "text", value: "abc" }));
    };
    unmount = mount(h(Form, null), container);
    const [checkbox, text] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.getAttribute("data-id")).toBe("7");
    expect(text.value).toBe("abc");

    replace("form", "done", false);
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
  });

  it("removes attributes it set once their props go away, but leaves attributes set outside the renderer alone", () => {
    replace("row", "busy", true);
    const Row = () => {
      const [{ busy }] = when(["row", "busy", $.busy]);
      return h("div", busy ? { "aria-busy": "true", title: "Working" } : { title: "Idle" });
    };
    unmount = mount(h(Row, null), container);
    const div = container.firstElementChild as HTMLElement;
    div.setAttribute("data-dragging", "");
    div.style.transform = "translateX(4px)";

    replace("row", "busy", false);
    expect(div.hasAttribute("aria-busy")).toBe(false);
    expect(div.getAttribute("title")).toBe("Idle");
    expect(div.hasAttribute("data-dragging")).toBe(true);
    expect(div.style.transform).toBe("translateX(4px)");
  });

  it("re-renders a nested component in the DOM when its when() dependency changes", () => {
    replace("counter", "n", 1);
    const Count = () => h("b", null, String(when(["counter", "n", $.n])[0].n));
    const App = () => h("p", null, "count: ", h(Count, null));
    unmount = mount(h(App, null), container);
    expect(container.textContent).toBe("count: 1");
    replace("counter", "n", 2);
    expect(container.textContent).toBe("count: 2");
  });

  it("invokes the newest handler closure even when a re-render leaves the DOM unchanged", () => {
    const seen: string[] = [];
    let label = "first";
    const Button = () => {
      when(["tick", $.n]);
      const captured = label;
      return h("button", { onClick: () => seen.push(captured) }, "go");
    };
    replace("tick", 1);
    unmount = mount(h(Button, null), container);
    const button = container.querySelector("button")!;
    label = "second";
    replace("tick", 2);
    button.dispatchEvent(new MouseEvent("click"));
    expect(seen).toEqual(["second"]);
  });
});
