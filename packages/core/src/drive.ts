// drive() / press() — operate the rendered UI from a program, a test or an
// agent through the same paths a user's input takes: a component's registered
// driver (which runs its onChange), or a real DOM event on its element.

import { runInAction } from "mobx";
import { db, type Term } from "./db";
import { useCleanup, useComponentId } from "./jsx";
import { componentChain, nodeFor } from "./mounts";

export type Driver = {
  /** Apply a value as if the user had produced it; the component's `onChange` fires. */
  set?: (value: Term) => void;
  /** The current value, for `describeUI()`; works for controlled components where no fact holds it. */
  get?: () => Term | undefined;
};

const drivers = new Map<string, Map<string, Driver>>();

/**
 * Expose a piece of the calling component's state to `drive()` and
 * `describeUI()` under `key`. Call it on every render, like `useCleanup`, so
 * the driver closes over the newest props; it is removed when the component
 * leaves the tree.
 */
export function useDriver(key: string, driver: Driver | ((value: Term) => void)): void {
  const id = useComponentId();
  let byKey = drivers.get(id);
  if (!byKey) {
    byKey = new Map();
    drivers.set(id, byKey);
  }
  byKey.set(key, typeof driver === "function" ? { set: driver } : driver);
  useCleanup(() => {
    const current = drivers.get(id);
    current?.delete(key);
    if (current?.size === 0) drivers.delete(id);
  });
}

/** The component ids to consult for `id`: itself, then the components enclosing it, innermost first. */
function candidates(id: string): string[] {
  const chain = componentChain(id);
  return chain.includes(id) ? chain : [id, ...chain];
}

/** The nearest component around `id` that drives `key`. */
function resolveDriver(id: string, key: string): Driver | undefined {
  for (const componentId of candidates(id)) {
    const driver = drivers.get(componentId)?.get(key);
    if (driver?.set) return driver;
  }
  return undefined;
}

/** The nearest component around `id` with drivers, and their current values. */
export function driversFor(id: string): { id: string; keys: Record<string, Term | undefined> } | undefined {
  for (const componentId of candidates(id)) {
    const byKey = drivers.get(componentId);
    if (!byKey) continue;
    const keys: Record<string, Term | undefined> = {};
    for (const [key, driver] of byKey) keys[key] = driver.get?.();
    return { id: componentId, keys };
  }
  return undefined;
}

/** Component ids that currently have drivers. */
export function drivenComponents(): Set<string> {
  return new Set(drivers.keys());
}

/** Reset the driver registry (for tests). */
export function clearDrivers(): void {
  drivers.clear();
}

// The intent is a fact only for the duration of the action, so a fact log
// shows what drove a change; it is never durable, so it is never stored.
function recording<T>(fact: Term[], fn: () => T): T {
  return runInAction(() => {
    db.withOwnerScope("drive", () => db.assert(...fact));
    try {
      return fn();
    } finally {
      db.drop(...fact);
    }
  });
}

type FormNode = Element & { value?: string; checked?: boolean; type?: string; disabled?: boolean };

function isFormControl(node: Element | Text | undefined): node is FormNode {
  if (!node || typeof Element === "undefined" || !(node instanceof Element)) return false;
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/** Type into or toggle a native form control the way the browser would report a user doing it. */
function driveNode(id: string, key: string, value: Term): boolean {
  const node = nodeFor(id);
  if (!isFormControl(node)) return false;
  if (key === "checked" && (node.type === "checkbox" || node.type === "radio")) {
    if (node.checked !== Boolean(value)) (node as unknown as HTMLElement).click();
    return true;
  }
  if (key === "value") {
    node.value = String(value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Set `key` on the component that owns `id` (a component or element id from
 * `describeUI()`), as the user would have: a component driver runs its
 * `onChange`, a native input receives the value with `input`/`change` events.
 * Throws when nothing around `id` drives `key`.
 */
export function drive(id: string, key: string, value: Term): void {
  recording(["drive", id, key, value], () => {
    const driver = resolveDriver(id, key);
    if (driver?.set) {
      driver.set(value);
      return;
    }
    if (driveNode(id, key, value)) return;
    throw new Error(`Nothing drives "${key}" on ${id}`);
  });
}

function clickHandler(id: string): ((event: unknown) => void) | undefined {
  for (const fact of db.facts.values()) {
    if (fact[0] === id && fact[1] === "handler" && fact[2] === "click") {
      const fn = db.getRef(String(fact[3]));
      return typeof fn === "function" ? (fn as (event: unknown) => void) : undefined;
    }
  }
  return undefined;
}

function pointerEvent(type: string): Event {
  const init = { bubbles: true, cancelable: true, button: 0, buttons: type === "pointerdown" ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
  return typeof PointerEvent !== "undefined" ? new PointerEvent(type, init) : new MouseEvent(type, init);
}

/**
 * Press the element with entity id `id` as a primary pointer would: `pointerdown`,
 * `pointerup` and `click` on its DOM node when one is rendered (so triggers that
 * act on pointerdown open too), otherwise its `onClick` handler with a minimal event.
 */
export function press(id: string): void {
  recording(["drive", id, "press"], () => {
    const node = nodeFor(id);
    if (node && "click" in node) {
      const el = node as HTMLElement;
      el.focus?.({ preventScroll: true });
      if (!(el as HTMLButtonElement).disabled) {
        el.dispatchEvent(pointerEvent("pointerdown"));
        el.dispatchEvent(pointerEvent("pointerup"));
      }
      el.click();
      return;
    }
    const handler = clickHandler(id);
    if (!handler) throw new Error(`Nothing to press at ${id}`);
    handler({ type: "click", target: null, currentTarget: null, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
  });
}
