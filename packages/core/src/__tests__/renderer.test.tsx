// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { db, $ } from "../db";
import { remember, replace, when } from "../primitives";
import { h, ImperativeHost } from "../jsx";
import { mount } from "../renderer";

describe("renderer", () => {
  beforeEach(() => {
    db.clear();
  });

  it("passes imperative host elements to callbacks and releases them", () => {
    const calls: (HTMLElement | null)[] = [];
    const container = document.createElement("div");

    const dispose = mount(
      <ImperativeHost
        id="terminal-host"
        class="terminal-output"
        onElement={(element) => calls.push(element)}
      />,
      container,
    );

    const host = container.querySelector("#terminal-host");
    expect(host).toBeInstanceOf(HTMLElement);
    expect(host?.className).toBe("terminal-output");
    expect(calls).toEqual([host]);

    dispose();

    expect(calls).toEqual([host, null]);
  });

  it("lets imperative hosts keep callback-owned children across patches", () => {
    const container = document.createElement("div");
    const dispose = mount(
      <ImperativeHost
        id="terminal-host"
        onElement={(element) => {
          if (!element || element.querySelector(".xterm")) return;
          const child = document.createElement("span");
          child.className = "xterm";
          child.textContent = "owned by xterm";
          element.appendChild(child);
        }}
      />,
      container,
    );

    expect(container.querySelector(".xterm")?.textContent).toBe("owned by xterm");

    remember("unrelated", "tick", 1);

    expect(container.querySelector(".xterm")?.textContent).toBe("owned by xterm");
    dispose();
  });

  it("releases the old element and hands over the new one when a host changes tag", () => {
    const calls: (Element | null)[] = [];
    const container = document.createElement("div");
    remember("host", "as", "div");
    const Host = () => {
      const [{ as }] = when(["host", "as", $.as]);
      return <ImperativeHost as={as as string} id="host" onElement={(element) => calls.push(element)} />;
    };
    const dispose = mount(<Host />, container);
    const div = container.querySelector("#host")!;
    expect(div.tagName).toBe("DIV");
    expect(calls).toEqual([div]);

    replace("host", "as", "section");
    const section = container.querySelector("#host")!;
    expect(section.tagName).toBe("SECTION");
    expect(calls).toEqual([div, null, section]);
    dispose();
    expect(calls).toEqual([div, null, section, null]);
  });
});
