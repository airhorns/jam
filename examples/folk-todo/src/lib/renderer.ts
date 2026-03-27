// Renderer — executes the component tree reactively and patches the real DOM.
//
// Architecture:
// 1. MobX autorun re-runs the component function when app-state facts change
// 2. Component function produces a VNode tree (plain JS objects)
// 3. Reconciler diffs VNodes against the real DOM and patches
// 4. VDOM facts are emitted into the DB for introspection (separate observable)
//
// The key insight: component functions read app-state facts via when().get(),
// which establishes MobX tracking. When those facts change, the autorun
// re-runs the component, producing a new VNode tree, which gets reconciled.

import { autorun } from "mobx";
import type { VNode, VChild } from "./jsx";

// --- DOM Reconciler ---

interface ManagedNode {
  dom: Node;
  vnode: VChild;
  children: ManagedNode[];
  handlers: Map<string, EventListener>;
}

function createDom(vnode: VChild): ManagedNode | null {
  if (vnode == null || typeof vnode === "boolean") return null;

  if (typeof vnode === "string" || typeof vnode === "number") {
    return {
      dom: document.createTextNode(String(vnode)),
      vnode,
      children: [],
      handlers: new Map(),
    };
  }

  if (Array.isArray(vnode)) {
    // Arrays are handled at the parent level
    return null;
  }

  if (!vnode.__vnode) return null;

  if (typeof vnode.tag === "function") {
    // Component: execute it
    const result = vnode.tag(vnode.props);
    return createDom(result);
  }

  if (vnode.tag === "__fragment") {
    // Fragments shouldn't reach here — handled by flattenChildren
    return null;
  }

  const el = document.createElement(vnode.tag as string);
  const handlers = new Map<string, EventListener>();

  // Set props
  for (const [key, value] of Object.entries(vnode.props)) {
    if (key === "key") continue;
    if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value as EventListener);
      handlers.set(event, value as EventListener);
    } else if (key === "checked" || key === "value" || key === "disabled") {
      (el as any)[key] = value;
    } else if (value != null && value !== false) {
      el.setAttribute(key, String(value));
    }
  }

  // Process children
  const children: ManagedNode[] = [];
  const flatChildren = flattenChildren(vnode.children);
  for (const child of flatChildren) {
    const managed = createDom(child);
    if (managed) {
      el.appendChild(managed.dom);
      children.push(managed);
    }
  }

  return { dom: el, vnode, children, handlers };
}

/** Flatten VChild arrays, fragments, and components into a flat list of renderable items. */
function flattenChildren(children: VChild[]): VChild[] {
  const result: VChild[] = [];
  for (const child of children) {
    if (child == null || typeof child === "boolean") continue;
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else if (typeof child === "object" && "__vnode" in child && child.tag === "__fragment") {
      result.push(...flattenChildren(child.children));
    } else {
      result.push(child);
    }
  }
  return result;
}

/** Reconcile: diff old managed tree against new VNode, patch DOM in place. */
function reconcile(
  parent: Node,
  oldManaged: ManagedNode | null,
  newVnode: VChild,
  index: number,
): ManagedNode | null {
  // New is null/empty
  if (newVnode == null || typeof newVnode === "boolean") {
    if (oldManaged) {
      parent.removeChild(oldManaged.dom);
    }
    return null;
  }

  // Text node
  if (typeof newVnode === "string" || typeof newVnode === "number") {
    const text = String(newVnode);
    if (oldManaged && oldManaged.dom instanceof Text) {
      if (oldManaged.dom.textContent !== text) {
        oldManaged.dom.textContent = text;
      }
      return { ...oldManaged, vnode: newVnode };
    }
    // Replace
    const node = document.createTextNode(text);
    if (oldManaged) {
      parent.replaceChild(node, oldManaged.dom);
    } else {
      insertAt(parent, node, index);
    }
    return { dom: node, vnode: newVnode, children: [], handlers: new Map() };
  }

  // Component
  if (typeof newVnode === "object" && "__vnode" in newVnode && typeof newVnode.tag === "function") {
    const result = newVnode.tag(newVnode.props);
    return reconcile(parent, oldManaged, result, index);
  }

  // Element
  if (typeof newVnode === "object" && "__vnode" in newVnode && typeof newVnode.tag === "string") {
    const tag = newVnode.tag;

    // Can we reuse the existing DOM element?
    if (
      oldManaged &&
      oldManaged.dom instanceof HTMLElement &&
      oldManaged.dom.tagName.toLowerCase() === tag
    ) {
      const el = oldManaged.dom;
      // Update props
      updateProps(el, oldManaged, newVnode);
      // Update handlers
      updateHandlers(el, oldManaged.handlers, newVnode.props);
      // Reconcile children
      const newChildren = reconcileChildren(el, oldManaged.children, flattenChildren(newVnode.children));
      return {
        dom: el,
        vnode: newVnode,
        children: newChildren,
        handlers: oldManaged.handlers,
      };
    }

    // Different tag or no old node — create fresh
    const managed = createDom(newVnode);
    if (!managed) return null;
    if (oldManaged) {
      parent.replaceChild(managed.dom, oldManaged.dom);
    } else {
      insertAt(parent, managed.dom, index);
    }
    return managed;
  }

  return null;
}

function reconcileChildren(
  parent: HTMLElement,
  oldChildren: ManagedNode[],
  newVnodes: VChild[],
): ManagedNode[] {
  const result: ManagedNode[] = [];
  const maxLen = Math.max(oldChildren.length, newVnodes.length);

  for (let i = 0; i < maxLen; i++) {
    const oldChild = i < oldChildren.length ? oldChildren[i] : null;
    const newChild = i < newVnodes.length ? newVnodes[i] : null;
    const managed = reconcile(parent, oldChild, newChild, i);
    if (managed) result.push(managed);
  }

  return result;
}

function updateProps(el: HTMLElement, oldManaged: ManagedNode, newVnode: VNode) {
  const oldProps = (oldManaged.vnode as VNode)?.props ?? {};
  const newProps = newVnode.props;

  // Remove old props not in new
  for (const key of Object.keys(oldProps)) {
    if (key === "key" || key.startsWith("on")) continue;
    if (!(key in newProps)) {
      if (key === "checked" || key === "value" || key === "disabled") {
        (el as any)[key] = undefined;
      } else {
        el.removeAttribute(key);
      }
    }
  }

  // Set new props
  for (const [key, value] of Object.entries(newProps)) {
    if (key === "key" || key.startsWith("on")) continue;
    if (key === "checked" || key === "value" || key === "disabled") {
      if ((el as any)[key] !== value) {
        (el as any)[key] = value;
      }
    } else if (value != null && value !== false) {
      const strVal = String(value);
      if (el.getAttribute(key) !== strVal) {
        el.setAttribute(key, strVal);
      }
    } else {
      el.removeAttribute(key);
    }
  }
}

function updateHandlers(
  el: HTMLElement,
  oldHandlers: Map<string, EventListener>,
  newProps: Record<string, unknown>,
) {
  // Remove old handlers
  for (const [event, listener] of oldHandlers) {
    el.removeEventListener(event, listener);
  }
  oldHandlers.clear();

  // Add new handlers
  for (const [key, value] of Object.entries(newProps)) {
    if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value as EventListener);
      oldHandlers.set(event, value as EventListener);
    }
  }
}

function insertAt(parent: Node, node: Node, index: number) {
  const ref = parent.childNodes[index];
  if (ref) {
    parent.insertBefore(node, ref);
  } else {
    parent.appendChild(node);
  }
}

// --- Mount ---

/**
 * Mount a component tree into a DOM container.
 * Re-renders reactively when app-state facts change.
 */
export function mount(rootVnode: VChild, container: HTMLElement): () => void {
  let currentTree: ManagedNode | null = null;

  const disposer = autorun(() => {
    // This autorun tracks any MobX observables read during component execution.
    // Component functions call when().get() which reads db.facts — tracked!
    // When app-state facts change, this re-runs.

    // Execute the component tree to produce a VNode
    // (Component functions that call when().get() will establish MobX tracking)
    let vnode: VChild = rootVnode;
    if (typeof rootVnode === "object" && rootVnode !== null && "__vnode" in rootVnode) {
      const rn = rootVnode as VNode;
      if (typeof rn.tag === "function") {
        vnode = (rn.tag as Function)(rn.props);
      }
    }

    // Reconcile against the real DOM
    currentTree = reconcile(container, currentTree, vnode, 0);
  });

  return disposer;
}
