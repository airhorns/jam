// JSX Factory — converts JSX into VNode objects, then expands and emits them.
//
// Rendering happens in two steps that the renderer runs in different MobX
// phases:
//   expandVdom — executes component functions (tracked, so any when() call
//                inside any component establishes reactivity), computes
//                entity IDs, and resolves context providers and portals into
//                a tree of plain intrinsic nodes.
//   emitExpanded — writes that tree into the fact database as VDOM claims.
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
  /** Id of the component whose render created this node, when one was rendering. */
  owner?: string;
};

export type ElementRef<T extends Element = HTMLElement> = (element: T | null) => void;

export type ImperativeHostProps<T extends Element = HTMLElement> = {
  as?: string;
  onElement: ElementRef<T>;
  children?: never;
} & Record<string, unknown>;

export type VChild = VNode | string | number | boolean | null | undefined | VChild[];

export function h(
  tag: string | Function,
  props: Record<string, unknown> | null,
  ...children: VChild[]
): VNode {
  const node: VNode = {
    __vnode: true,
    tag,
    props: props ?? {},
    children: children.flat(10) as VChild[],
  };
  if (currentComponentId != null) node.owner = currentComponentId;
  return node;
}

export function Fragment(props: Record<string, unknown> | null, ...children: VChild[]): VNode {
  const kids = children.length > 0 ? children : props?.children != null ? [props.children as VChild] : [];
  return {
    __vnode: true,
    tag: "__fragment",
    props: {},
    children: kids.flat(10) as VChild[],
  };
}

function isFragment(node: VNode): boolean {
  return node.tag === "__fragment" || node.tag === Fragment;
}

/**
 * Render a DOM element whose subtree is owned by imperative code.
 *
 * The renderer creates and updates the host element, then calls onElement when
 * the real DOM element is available and again with null when it is released.
 * Children are intentionally not reconciled so libraries like terminal
 * emulators can own the host subtree.
 */
export function ImperativeHost<T extends Element = HTMLElement>(props: ImperativeHostProps<T>): VNode {
  const { as = "div", onElement, children: _children, ...rest } = props;
  return h(as, {
    ...rest,
    __jamElementRef: onElement,
    __jamChildMode: "imperative",
  });
}

// ---- Context ----

export type Context<T> = {
  Provider: ((props: { value: T; children?: VChild | VChild[] }) => VNode) & {
    __contextProvider: Context<T>;
  };
  defaultValue: T;
};

type ContextFrame = { context: Context<unknown>; value: unknown };
let contextStack: ContextFrame[] = [];

/**
 * Create a context. Wrap a subtree in `<ctx.Provider value={...}>` and read
 * the nearest value from any component inside it with `useContext(ctx)`.
 * Context is resolved during expansion, so it only works for components
 * executed as part of the tree (not from whenever() bodies).
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const Provider = ((props: { value: T; children?: VChild | VChild[] }) =>
    Fragment(null, props.children as VChild)) as Context<T>["Provider"];
  const context: Context<T> = { Provider, defaultValue };
  Provider.__contextProvider = context;
  return context;
}

export function useContext<T>(context: Context<T>): T {
  for (let i = contextStack.length - 1; i >= 0; i--) {
    if (contextStack[i].context === (context as Context<unknown>)) {
      return contextStack[i].value as T;
    }
  }
  return context.defaultValue;
}

// ---- Component identity ----

let currentComponentId: string | null = null;

/**
 * The entity ID the currently-executing component's root output will
 * receive. Stable across renders for a given tree position (or `key`),
 * so it can key per-instance state stored in the fact database.
 * Only valid while a component function is executing.
 */
export function useComponentId(): string {
  if (currentComponentId == null) {
    throw new Error("useComponentId() can only be called while a component is rendering");
  }
  return currentComponentId;
}

// ---- Cleanup ----

export type Cleanup = () => void;

let currentCleanups: Map<string, Cleanup[]> | null = null;

// ---- Component tree ----

export type ComponentInfo = {
  /** The component function's name(s), for describing the tree; presentational names are left out when a semantic one shares the id. */
  name: string;
  /** Id of the component that rendered this one, or null at the root. */
  parent: string | null;
  /** True when every component under this id is a styling wrapper (`Component.presentational = true`), so `describeUI()` reports its element by role alone. */
  presentational: boolean;
};

/** Which component each element and component belongs to, recorded during the current `expandTree`. */
let currentStructure: { components: Map<string, ComponentInfo>; owners: Map<string, string> } | null = null;

/** The component whose returned output is being expanded; owns nodes that were not created inside a render. */
let expandingComponent: string | null = null;

/**
 * Run `fn` when the currently-executing component leaves the tree (or the
 * tree is unmounted). Call it on every render, like `useComponentId`: the
 * functions registered by the latest render are the ones that run, so they
 * see the component's newest props. Outside `mount()` (`emitVdom`,
 * `injectVdom`) nothing tracks a component's lifetime and the call is ignored.
 */
export function useCleanup(fn: Cleanup): void {
  if (currentComponentId == null) {
    throw new Error("useCleanup() can only be called while a component is rendering");
  }
  if (!currentCleanups) return;
  const list = currentCleanups.get(currentComponentId);
  if (list) list.push(fn);
  else currentCleanups.set(currentComponentId, [fn]);
}

// ---- Portals ----

/**
 * Render children at the root of the mounted tree instead of in place, so
 * overlays escape ancestor overflow/z-index contexts. Children keep IDs
 * derived from the portal's own position, so they stay stable across renders.
 */
export function Portal(_props: { children?: VChild | VChild[] }): VNode {
  throw new Error("Portal is handled by the renderer and should not be called directly");
}

const PORTAL_BASE_INDEX = 1_000_000;
const PORTAL_SLOT_SIZE = 1_000;
let portalCounter = 0;

// ---- Expanded tree ----

export type ExpandedElement = {
  kind: "element";
  id: string;
  tag: string;
  props: Record<string, unknown>;
  children: ExpandedNode[];
};

export type ExpandedText = {
  kind: "text";
  id: string;
  text: string;
};

export type ExpandedPortal = {
  kind: "portal";
  baseIndex: number;
  children: ExpandedNode[];
};

export type ExpandedNode = ExpandedElement | ExpandedText | ExpandedPortal;

/** Flatten VChild arrays, fragments, and nulls into a flat list. */
function flattenChildren(children: VChild[]): VChild[] {
  const result: VChild[] = [];
  for (const child of children) {
    if (child == null || typeof child === "boolean") continue;
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else if (typeof child === "object" && "__vnode" in child && isFragment(child)) {
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
 * Expand a list of children that all sit in one slot (a fragment returned by
 * a component, or a Provider's children). A single child is transparent and
 * keeps the slot's identity; several children are scoped under the slot's
 * id so they can't collide with the slot's following siblings.
 */
function expandSlotList(
  out: ExpandedNode[],
  children: VChild[],
  parentId: string,
  childIndex: number,
  inheritId: string | undefined,
): void {
  const flat = flattenChildren(children);
  if (flat.length === 1) {
    expandVdom(out, flat[0], parentId, childIndex, inheritId);
    return;
  }
  const slotId = inheritId ?? `${parentId}:${childIndex}`;
  for (let i = 0; i < flat.length; i++) {
    expandVdom(out, flat[i], slotId, i);
  }
}

/**
 * Expand a VNode tree: run components, resolve context and portals, and
 * compute entity IDs. Appends the resulting nodes to `out`.
 * @param inheritId — if set, use this as the entity ID (a component's root takes the component's id)
 */
export function expandVdom(
  out: ExpandedNode[],
  node: VChild,
  parentId: string,
  childIndex: number,
  inheritId?: string,
): void {
  if (node == null || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    const textId = inheritId ?? `${parentId}:${childIndex}`;
    out.push({ kind: "text", id: textId, text: String(node) });
    return;
  }

  if (Array.isArray(node)) {
    expandSlotList(out, node, parentId, childIndex, inheritId);
    return;
  }

  if (!node.__vnode) return;
  const vnode = node as VNode;

  if (isFragment(vnode)) {
    expandSlotList(out, vnode.children, parentId, childIndex, inheritId);
    return;
  }

  if (typeof vnode.tag === "function") {
    const tag = vnode.tag as Function & { __contextProvider?: Context<unknown> };

    if (tag === Portal) {
      const portalId = computeEntityId(parentId, childIndex, vnode.props, inheritId);
      const baseIndex = PORTAL_BASE_INDEX + portalCounter++ * PORTAL_SLOT_SIZE;
      const children: ExpandedNode[] = [];
      const flat = flattenChildren(vnode.children);
      for (let i = 0; i < flat.length; i++) {
        expandVdom(children, flat[i], portalId, i);
      }
      out.push({ kind: "portal", baseIndex, children });
      return;
    }

    if (tag.__contextProvider) {
      contextStack.push({ context: tag.__contextProvider, value: vnode.props.value });
      try {
        expandSlotList(out, vnode.children, parentId, childIndex, inheritId);
      } finally {
        contextStack.pop();
      }
      return;
    }

    // Component: execute it, propagate the key to its root output element.
    // `id` stays an ordinary prop here; only the element it ends up on takes
    // it as an entity id, so a component may hand it to a nested input.
    // Merge children into props so components can access them.
    const propsWithChildren = vnode.children.length > 0
      ? { ...vnode.props, children: vnode.children.length === 1 ? vnode.children[0] : vnode.children }
      : vnode.props;
    const componentId = computeEntityId(parentId, childIndex, { key: vnode.props.key }, inheritId);
    if (currentStructure) {
      const name = (tag as { displayName?: string }).displayName ?? tag.name ?? "Anonymous";
      const presentational = (tag as { presentational?: boolean }).presentational === true;
      const parent = vnode.owner ?? expandingComponent;
      // A component whose whole output is another component shares its id with it; record both names under that id.
      const shared = parent === componentId ? currentStructure.components.get(componentId) : undefined;
      if (!shared) currentStructure.components.set(componentId, { name, parent, presentational });
      else if (shared.presentational) {
        shared.name = presentational ? `${shared.name}/${name}` : name;
        shared.presentational = presentational;
      } else if (!presentational && !shared.name.endsWith(name)) shared.name = `${shared.name}/${name}`;
    }
    const prevComponentId = currentComponentId;
    currentComponentId = componentId;
    let result: VChild;
    try {
      result = tag(propsWithChildren) as VChild;
    } finally {
      currentComponentId = prevComponentId;
    }
    if (result != null) {
      const prevExpanding = expandingComponent;
      expandingComponent = componentId;
      try {
        expandVdom(out, result, parentId, childIndex, componentId);
      } finally {
        expandingComponent = prevExpanding;
      }
    }
    return;
  }

  const elId = computeEntityId(parentId, childIndex, vnode.props, inheritId);
  const owner = vnode.owner ?? expandingComponent;
  if (owner != null) currentStructure?.owners.set(elId, owner);
  const children: ExpandedNode[] = [];
  const flat = flattenChildren(vnode.children);
  for (let i = 0; i < flat.length; i++) {
    expandVdom(children, flat[i], elId, i);
  }
  out.push({ kind: "element", id: elId, tag: vnode.tag, props: vnode.props, children });
}

export type Expansion = {
  nodes: ExpandedNode[];
  /** Cleanups registered with `useCleanup`, by component id. */
  cleanups: Map<string, Cleanup[]>;
  /** Every component instance in the tree, by id. */
  components: Map<string, ComponentInfo>;
  /** The component that rendered each element, by element id. */
  owners: Map<string, string>;
};

/**
 * Expand a complete tree from the root, collecting the cleanups its
 * components registered and which component produced each element. Resets
 * per-render counters so portal ordering is deterministic.
 */
export function expandTree(node: VChild, rootId = "dom"): Expansion {
  portalCounter = 0;
  contextStack = [];
  const nodes: ExpandedNode[] = [];
  const cleanups = new Map<string, Cleanup[]>();
  const structure = { components: new Map<string, ComponentInfo>(), owners: new Map<string, string>() };
  const prevCleanups = currentCleanups;
  const prevStructure = currentStructure;
  const prevExpanding = expandingComponent;
  currentCleanups = cleanups;
  currentStructure = structure;
  expandingComponent = null;
  try {
    expandVdom(nodes, node, rootId, 0);
  } finally {
    currentCleanups = prevCleanups;
    currentStructure = prevStructure;
    expandingComponent = prevExpanding;
  }
  return { nodes, cleanups, ...structure };
}

/** `expandTree` without the cleanups, for callers that only need the nodes. */
export function expandRoot(node: VChild, rootId = "dom"): ExpandedNode[] {
  return expandTree(node, rootId).nodes;
}

function serializeStyle(style: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === false) continue;
    const prop = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    parts.push(`${prop}: ${value}`);
  }
  return parts.join("; ");
}

/**
 * Write expanded nodes into the fact database as children of `parentId`,
 * occupying child indices `startIndex, startIndex + 1, ...`.
 */
export function emitExpanded(nodes: ExpandedNode[], parentId: string, startIndex = 0): void {
  for (let i = 0; i < nodes.length; i++) {
    emitNode(nodes[i], parentId, startIndex + i);
  }
}

function emitNode(node: ExpandedNode, parentId: string, index: number): void {
  if (node.kind === "text") {
    db.assert(node.id, "tag", "__text");
    db.assert(node.id, "text", node.text);
    db.assert(parentId, "child", index, node.id);
    return;
  }

  if (node.kind === "portal") {
    emitExpanded(node.children, "dom", node.baseIndex);
    return;
  }

  const elId = node.id;
  const props = node.props;

  db.assert(elId, "tag", node.tag);
  db.assert(parentId, "child", index, elId);

  for (const [key, value] of Object.entries(props)) {
    if (key === "key" || value == null) continue;
    if (key === "__jamElementRef") {
      if (typeof value === "function") {
        const refKey = `${elId}:element-ref`;
        db.setRef(refKey, value);
        db.assert(elId, "elementRef", refKey);
      }
      continue;
    }
    if (key === "__jamChildMode") {
      if (value === "imperative") db.assert(elId, "childMode", "imperative");
      continue;
    }
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      const refKey = `${elId}:handler:${eventName}`;
      db.setRef(refKey, value);
      db.assert(elId, "handler", eventName, refKey);
    } else if ((key === "class" || key === "className") && typeof value === "string") {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        db.assert(elId, "class", cls);
      }
    } else if (key === "style" && typeof value === "object") {
      const css = serializeStyle(value as Record<string, unknown>);
      if (css) db.assert(elId, "prop", "style", css);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      db.assert(elId, "prop", key, value as Term);
    }
  }

  emitExpanded(node.children, elId, 0);
}

/**
 * Expand and emit a single VNode in one step as child `childIndex` of
 * `parentId`. The renderer expands and emits in separate phases; this is for
 * callers outside the mounted tree.
 */
export function emitVdom(node: VChild, parentId: string, childIndex: number): void {
  const out: ExpandedNode[] = [];
  expandVdom(out, node, parentId, childIndex);
  emitExpanded(out, parentId, childIndex);
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
  const out: ExpandedNode[] = [];
  for (let i = 0; i < flat.length; i++) {
    expandVdom(out, flat[i], parentId, startIndex + i);
  }
  emitExpanded(out, parentId, startIndex);
}
