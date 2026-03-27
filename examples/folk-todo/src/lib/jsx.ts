// JSX Factory — converts JSX into VDOM fact claims.
//
// <div class="app"><h1>Todos</h1></div>
// → h("div", {class: "app"}, h("h1", null, "Todos"))
// → claims: [el, "tag", "div"], [el, "prop", "class", "app"], [el, "child", 0, child], ...
//
// When tag is a function (component), it gets its own reactive scope.

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

// Context: tracks the current parent during VDOM claim emission
let _currentParent: string | null = null;
let _currentChildIndex = 0;

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

/**
 * Emit VDOM claims for a VNode tree into the fact database.
 * Called by the renderer during component execution.
 */
export function emitVdom(node: VChild, parentId: string, childIndex: number): void {
  if (node == null || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    const textId = genId();
    db.assert(textId, "tag", "__text");
    db.assert(textId, "text", String(node));
    db.assert(parentId, "child", childIndex, textId);
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      emitVdom(node[i], parentId, childIndex + i);
    }
    return;
  }

  if (!node.__vnode) return;
  const vnode = node as VNode;

  if (typeof vnode.tag === "function") {
    // Component: execute it to get its VNode output, then emit that
    const component = vnode.tag;
    const result = component(vnode.props);
    if (result) {
      emitVdom(result, parentId, childIndex);
    }
    return;
  }

  // Fragment: just emit children directly under the parent
  if (vnode.tag === "__fragment") {
    for (let i = 0; i < vnode.children.length; i++) {
      emitVdom(vnode.children[i], parentId, childIndex + i);
    }
    return;
  }

  // Intrinsic element: emit claims
  const elId = vnode.id;
  db.assert(elId, "tag", vnode.tag);
  db.assert(parentId, "child", childIndex, elId);

  // Props
  for (const [key, value] of Object.entries(vnode.props)) {
    if (key === "key") continue; // consumed by h()
    if (key.startsWith("on") && typeof value === "function") {
      // Event handler: store ref in side channel
      const eventName = key.slice(2).toLowerCase();
      const refKey = `${elId}:handler:${eventName}`;
      db.setRef(refKey, value);
      db.assert(elId, "handler", eventName, refKey);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      db.assert(elId, "prop", key, value as Term);
    }
  }

  // Children
  for (let i = 0; i < vnode.children.length; i++) {
    emitVdom(vnode.children[i], elId, i);
  }
}
