// Test helpers for rendering @jam/ui components into a real (happy-dom) DOM
// and inspecting the CSS the style system injected for them.

import { db, mount } from "@jam/core";
import type { VChild } from "@jam/core/jsx";
import { clearInjectedStyles } from "./css";
import { disposeMedia } from "./media";
import { resetTokenCache } from "./tokens";
import { clearThemeCSS, resetThemeCache } from "./themes";
import { resetFontCache } from "./fonts";
import { resetSettings } from "./settings";

export type RenderResult = {
  container: HTMLElement;
  /** The first element child of the container. */
  root: HTMLElement;
  unmount: () => void;
  /** Query the rendered tree; throws if nothing matches. */
  get: <T extends Element = HTMLElement>(selector: string) => T;
  query: <T extends Element = HTMLElement>(selector: string) => T | null;
  all: <T extends Element = HTMLElement>(selector: string) => T[];
};

const mounted: Array<() => void> = [];

/**
 * Mount a VNode into a fresh container attached to document.body. The
 * container is removed on `unmount()` or by `cleanup()`.
 *
 * Only one tree can be mounted at a time (all trees expand under the "dom"
 * root in the fact database), so rendering again unmounts the previous tree.
 */
export function render(vnode: VChild): RenderResult {
  cleanup();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const dispose = mount(vnode, container);
  const unmount = () => {
    dispose();
    container.remove();
    const i = mounted.indexOf(unmount);
    if (i >= 0) mounted.splice(i, 1);
  };
  mounted.push(unmount);
  return {
    container,
    get root() {
      return container.firstElementChild as HTMLElement;
    },
    unmount,
    get: (selector) => {
      const el = container.querySelector(selector);
      if (!el) throw new Error(`No element matches "${selector}" in:\n${container.innerHTML}`);
      return el as any;
    },
    query: (selector) => container.querySelector(selector) as any,
    all: (selector) => Array.from(container.querySelectorAll(selector)) as any,
  };
}

/** Unmount everything rendered so far. */
export function cleanup(): void {
  while (mounted.length > 0) mounted[mounted.length - 1]();
}

/**
 * Reset all global UI state: mounted trees, the fact database, design-system
 * caches, injected styles, media listeners, and any leftover portal/theme DOM.
 */
export function resetUI(): void {
  cleanup();
  db.clear();
  resetTokenCache();
  resetThemeCache();
  resetFontCache();
  resetSettings();
  clearThemeCSS();
  clearInjectedStyles();
  disposeMedia();
  if (typeof document === "undefined") return;
  document.body.innerHTML = "";
  document.documentElement.className = "";
  document.querySelectorAll("style[id^='jamagui']").forEach((el) => el.remove());
}

function parseDeclarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of block.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (prop) out[prop] = value;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every `.class[pseudo] { … }` rule text from all jamagui style sheets. */
export function injectedRules(): string[] {
  const rules: string[] = [];
  for (const style of Array.from(document.querySelectorAll<HTMLStyleElement>("style[id^='jamagui']"))) {
    const sheet = style.sheet;
    if (!sheet) continue;
    for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
  }
  return rules;
}

/**
 * Collect the declarations the style system injected for an element by
 * looking up rules whose selector is exactly `.<class><pseudo>` for each of
 * the element's classes. Later classes/rules override earlier ones.
 *
 *   css(button)              → { display: "flex", … }
 *   css(button, ":hover")    → hover declarations
 *   css(el, "::placeholder") → placeholder declarations
 */
export function css(el: Element, pseudo = ""): Record<string, string> {
  const result: Record<string, string> = {};
  const classes = Array.from(el.classList);
  for (const rule of injectedRules()) {
    for (const cls of classes) {
      const re = new RegExp(`^\\.${escapeRegExp(cls)}${escapeRegExp(pseudo)}\\s*\\{([^}]*)\\}`);
      const match = rule.match(re);
      if (match) Object.assign(result, parseDeclarations(match[1]));
    }
  }
  return result;
}

/** Declarations injected for an element inside a given `@media` query. */
export function mediaCss(el: Element, mediaQuery: string): Record<string, string> {
  const result: Record<string, string> = {};
  const classes = Array.from(el.classList);
  for (const rule of injectedRules()) {
    if (!rule.startsWith("@media")) continue;
    const headerEnd = rule.indexOf("{");
    const header = rule.slice(6, headerEnd).trim();
    if (header !== mediaQuery.trim()) continue;
    const body = rule.slice(headerEnd + 1, rule.lastIndexOf("}"));
    for (const cls of classes) {
      const re = new RegExp(`\\.${escapeRegExp(cls)}\\s*\\{([^}]*)\\}`);
      const match = body.match(re);
      if (match) Object.assign(result, parseDeclarations(match[1]));
    }
  }
  return result;
}

/** Resolved computed style, for when cascade/inheritance matters. */
export function computed(el: Element): CSSStyleDeclaration {
  return getComputedStyle(el);
}

// ---- Events ----

export function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

export function keydown(el: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

export function keyup(el: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

/** Set an input's value and fire `input` + `change`. */
export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function focus(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(new FocusEvent("focus"));
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

export function blur(el: HTMLElement): void {
  el.blur();
  el.dispatchEvent(new FocusEvent("blur"));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

export function pointerEnter(el: Element): void {
  el.dispatchEvent(new MouseEvent("pointerenter", { bubbles: false }));
  el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
  el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

export function pointerLeave(el: Element): void {
  el.dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
  el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
  el.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
}

/** Resolve after pending timers/microtasks (for delays like tooltip open). */
export function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
