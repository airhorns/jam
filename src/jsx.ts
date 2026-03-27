// JSX Factory — converts JSX into VNode objects.
// The renderer calls emitVdom() to write these as VDOM claims into db.vdom.
//
// Key propagation: when a component has a key (e.g. <TodoItem key={id}>),
// its root output element inherits that key as its entity ID. This makes
// elements addressable — external programs can target "k:{id}" to decorate.

import { db, type Term } from "./db";

export type VNode = {
  __vnode: true;
  id: string;
  tag: string | Function;
  props: Record<string, unknown>;
  children: VChild[];
};

export type VChild = VNode | string | number | boolean | null | undefined | VChild[];

let _nextId = 0;
function genId(): string {
  return `e${_nextId++}`;
}

export function h(
  tag: string | Function,
  props: Record<string, unknown> | null,
  ...children: VChild[]
): VNode {
  const id = (props?.key != null) ? `k:${props.key}` : genId();
  return {
    __vnode: true,
    id,
    tag,
    props: props ?? {},
    children: children.flat(10) as VChild[],
  };
}

export function Fragment(_props: Record<string, unknown> | null, ...children: VChild[]): VNode {
  return {
    __vnode: true,
    id: genId(),
    tag: "__fragment",
    props: {},
    children: children.flat(10) as VChild[],
  };
}

/** Flatten VChild arrays, fragments, and components into a flat list. */
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

/**
 * Emit VDOM claims for a VNode tree into the unified fact database.
 * @param inheritId — if set, the root intrinsic element uses this as its entity ID
 *                     (for component key propagation)
 */
export function emitVdom(
  node: VChild,
  parentId: string,
  childIndex: number,
  inheritId?: string,
): void {
  if (node == null || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    const textId = inheritId ?? genId();
    db.assert(textId, "tag", "__text");
    db.assert(textId, "text", String(node));
    db.assert(parentId, "child", childIndex, textId);
    return;
  }

  if (Array.isArray(node)) {
    const flat = flattenChildren(node);
    for (let i = 0; i < flat.length; i++) {
      emitVdom(flat[i], parentId, childIndex + i);
    }
    return;
  }

  if (!node.__vnode) return;
  const vnode = node as VNode;

  if (typeof vnode.tag === "function") {
    // Component: execute it, propagate key to root output element
    const result = (vnode.tag as Function)(vnode.props);
    if (result) {
      // If this component has a key (id starts with k:), propagate it
      const propagatedId = vnode.id.startsWith("k:") ? vnode.id : undefined;
      emitVdom(result, parentId, childIndex, propagatedId);
    }
    return;
  }

  if (vnode.tag === "__fragment") {
    const flat = flattenChildren(vnode.children);
    for (let i = 0; i < flat.length; i++) {
      emitVdom(flat[i], parentId, childIndex + i);
    }
    return;
  }

  // Intrinsic element: emit claims
  // Use inheritId if provided (component key propagation), else the vnode's own id
  const elId = inheritId ?? vnode.id;
  db.assert(elId, "tag", vnode.tag);
  db.assert(parentId, "child", childIndex, elId);

  // Props — "class" gets its own fact type so external programs can add classes
  for (const [key, value] of Object.entries(vnode.props)) {
    if (key === "key") continue;
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      const refKey = `${elId}:handler:${eventName}`;
      db.setRef(refKey, value);
      db.assert(elId, "handler", eventName, refKey);
    } else if (key === "class" && typeof value === "string") {
      // Emit each class as a separate claim so external programs can add more
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        db.assert(elId, "class", cls);
      }
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      db.assert(elId, "prop", key, value as Term);
    }
  }

  // Children
  const flat = flattenChildren(vnode.children);
  for (let i = 0; i < flat.length; i++) {
    emitVdom(flat[i], elId, i);
  }
}
