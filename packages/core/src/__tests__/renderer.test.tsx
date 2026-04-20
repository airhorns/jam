// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { remember } from "../primitives";
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
});
