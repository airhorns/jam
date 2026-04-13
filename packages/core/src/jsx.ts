// JSX Factory — converts JSX into VNode objects.
// The renderer calls emitVdom() to write these as VDOM claims.
//
// Entity IDs are path-based and deterministic:
//   non-keyed: {parentId}:{childIndex}
//   keyed:     {parentId}:k:{key}
//   id prop:   the id value directly (global addressing, opt-in)
//
// Component key propagation: <Foo key={k}> passes the parent-scoped
// keyed ID to its root output element.

import { db, type Term } from "./db";

export type VNode = {
  __vnode: true;
  tag: string | Function;
  props: Record<string, unknown>;
  children: VChild[];
};

export type VChild =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | VChild[];

export function h(
  tag: string | Function,
  props: Record<string, unknown> | null,
  ...children: VChild[]
): VNode {
  return {
    __vnode: true,
    tag,
    props: props ?? {},
    children: children.flat(10) as VChild[],
  };
}

export function Fragment(
  _props: Record<string, unknown> | null,
  ...children: VChild[]
): VNode {
  return {
    __vnode: true,
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
    } else if (
      typeof child === "object" &&
      "__vnode" in child &&
      child.tag === "__fragment"
    ) {
      result.push(...flattenChildren(child.children));
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Compute the entity ID for an element.
 * Priority: id prop > inheritId > keyed path > indexed path
 * The id prop always wins — it's the opt-in global address.
 */
function computeEntityId(
  parentId: string,
  childIndex: number,
  props: Record<string, unknown>,
  inheritId?: string,
): string {
  if (props.id != null) return String(props.id);
  if (inheritId) return inheritId;
  if (props.key != null) return `${parentId}:k:${props.key}`;
  return `${parentId}:${childIndex}`;
}

/**
 * Emit VDOM claims for a VNode tree into the unified fact database.
 * @param inheritId — if remember, use this as the entity ID (for component key/id propagation)
 */
export function emitVdom(
  node: VChild,
  parentId: string,
  childIndex: number,
  inheritId?: string,
): void {
  if (node == null || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    const textId = inheritId ?? `${parentId}:${childIndex}`;
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
    // Component: execute it, propagate key/id to root output element
    // Merge children into props so components can access them
    const propsWithChildren =
      vnode.children.length > 0
        ? {
            ...vnode.props,
            children:
              vnode.children.length === 1 ? vnode.children[0] : vnode.children,
          }
        : vnode.props;
    const result = (vnode.tag as Function)(propsWithChildren);
    if (result) {
      // Compute the ID this component would get, and propagate to its output
      const componentId = computeEntityId(
        parentId,
        childIndex,
        vnode.props,
        inheritId,
      );
      emitVdom(result, parentId, childIndex, componentId);
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
  const elId = computeEntityId(parentId, childIndex, vnode.props, inheritId);

  // Native mode: use component displayName as tag instead of HTML tag
  const tagName = vnode.props.__nativeTag
    ? String(vnode.props.__nativeTag)
    : vnode.tag;
  db.assert(elId, "tag", tagName as string);
  db.assert(parentId, "child", childIndex, elId);

  // Native mode: emit resolved style values as individual facts
  if (vnode.props.__nativeStyles) {
    for (const [prop, value] of Object.entries(
      vnode.props.__nativeStyles as Record<string, unknown>,
    )) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        db.assert(elId, "style", prop, value as Term);
      }
    }
  }

  // Props
  for (const [key, value] of Object.entries(vnode.props)) {
    if (key === "key") continue;
    // Skip internal native-mode props
    if (
      key === "__nativeStyles" ||
      key === "__nativeTag" ||
      key.startsWith("__native_")
    )
      continue;
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      const refKey = `${elId}:handler:${eventName}`;
      db.setRef(refKey, value);
      db.assert(elId, "handler", eventName, refKey);
    } else if (key === "class" && typeof value === "string") {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        db.assert(elId, "class", cls);
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      db.assert(elId, "prop", key, value as Term);
    }
  }

  // Children
  const flat = flattenChildren(vnode.children);
  for (let i = 0; i < flat.length; i++) {
    emitVdom(flat[i], elId, i);
  }
}

/**
 * Inject VDOM nodes into an existing parent element from outside the
 * component tree. Use this in whenever() bodies or external programs
 * to add children to rendered elements.
 *
 * @param parentId — entity ID of the parent element (e.g. "session-s-1", or from select())
 * @param startIndex — child index to start at (use a high number like 1000 to avoid
 *                      conflicts with component-emitted children)
 * @param nodes — VChild nodes (JSX elements, strings, etc.)
 */
export function injectVdom(
  parentId: string,
  startIndex: number,
  ...nodes: VChild[]
): void {
  const flat = flattenChildren(nodes);
  for (let i = 0; i < flat.length; i++) {
    emitVdom(flat[i], parentId, startIndex + i);
  }
}
