// ============================================================================
// Jam Runtime — executes in QuickJS
//
// Provides the core reactive primitives: claim, when, hold, render.
// TypeScript types in jam.d.ts provide edit-time checking; this file
// provides the runtime behavior.
//
// At runtime, when() registers rules into __rules. claim() either accumulates
// into a collector (when inside a rule body being fired) or into
// __topLevelClaims (when at the script top level during registration).
// ============================================================================

// --- Internal state ---

interface BindingMarker {
  __binding: true;
  name: string;
}

interface OrMarker {
  __or: true;
  values: any[];
}

interface RegisteredRule {
  patterns: any[][];
  body: Function;
  whens: RegisteredRule[];
}

// Rules registered by when() calls
const __rules: RegisteredRule[] = [];
// Claims made at the top level of a script (outside when bodies)
const __topLevelClaims: any[][] = [];
// Collector for claims made inside a rule body during firing
let __collector: any[][] | null = null;
// Registration depth: 0 = top level, >0 = inside a when body during registration
let __registrationDepth = 0;

// --- $this: scoped entity identity ---

/**
 * The current entity identity, like Folk's `$this`.
 * Scoped by child() and render(). Defaults to "root".
 * Used to derive entity IDs for claims and JSX elements.
 */
const __thisStack: string[] = ["root"];

Object.defineProperty(globalThis, "$this", {
  get() {
    return __thisStack[__thisStack.length - 1];
  },
});

declare var $this: string;

// --- child(): scoped nesting ---

/**
 * Create a nested entity scope. Derives a child entity ID as
 * `${parent}/${name}`, auto-claims the parent-child relationship,
 * and sets $this to the child ID for the duration of fn.
 *
 * @example
 * child("title", () => {
 *     claim($this, "isa", "Text");
 *     claim($this, "text", "Hello");
 * });
 * // produces: ("root/title", "isa", "Text"), ("root", "child", "title", "root/title")
 */
function child(name: string, fn: () => void): void {
  const parent = $this;
  const childId = `${parent}/${name}`;
  const order = __childOrder.get(parent) ?? 0;
  __childOrder.set(parent, order + 1);
  const sortKey = String(order).padStart(5, "0") + "#" + name;
  claim(parent, "child", sortKey, childId);
  __thisStack.push(childId);
  try {
    fn();
  } finally {
    __thisStack.pop();
  }
}

// --- $ proxy: creates binding markers ---

/**
 * Binding proxy. Access any property to create a named pattern variable.
 * @example
 * $.value   // captures the term at this position as "value"
 * $.x       // captures as "x"
 */
const $: any = new Proxy(
  {},
  {
    get(_target: any, prop: string | symbol): BindingMarker | undefined {
      if (typeof prop === "symbol") return undefined;
      return { __binding: true, name: prop };
    },
  }
);

/**
 * Wildcard. Matches any value without capturing.
 * @example when([_, "is", "cool"], () => { ... })
 */
const _ = Symbol("wildcard");

/**
 * Match any of the given values at a pattern position.
 * @example when([$.x, "is", or("cool", "awesome")], ({ x }) => { ... })
 */
function or(...values: any[]): OrMarker {
  return { __or: true, values };
}

// --- hold(): persistent mutable state ---

interface HoldOp {
  key: string;
  stmts: any[][];
}

const __holdOps: HoldOp[] = [];
const __holdAutoKeyCounters: Map<string, number> = new Map();
let __inHold = false;
let __holdCollector: any[][] | null = null;

/**
 * Persistent mutable state, like Folk's Hold!.
 *
 * Creates a scope where claim() calls accumulate facts. When called again
 * with the same key, all previous facts under that key are retracted and
 * the new ones are asserted.
 *
 * @param keyOrFn - Either an explicit string key, or a callback (auto-keyed from $this context)
 * @param maybeFn - The callback (when first arg is a key string)
 *
 * @example
 * // Auto-key from context
 * hold(() => { claim("greeting", "hello"); });
 *
 * // Explicit key
 * hold("counter", () => { claim("counter", "count", 0); });
 *
 * // Multiple claims, logic, loops
 * hold("profile", () => {
 *     claim("user", "name", "Alice");
 *     if (showEmail) claim("user", "email", "alice@example.com");
 *     for (const tag of tags) claim("user", "tag", tag);
 * });
 *
 * // Empty callback retracts all facts under the key
 * hold("data", () => {});
 */
function hold(keyOrFn: string | (() => void), maybeFn?: () => void): void {
  let key: string;
  let fn: () => void;

  if (typeof keyOrFn === "function") {
    fn = keyOrFn;
    const counter = __holdAutoKeyCounters.get($this) ?? 0;
    __holdAutoKeyCounters.set($this, counter + 1);
    key = `${$this}:hold:${counter}`;
  } else {
    key = keyOrFn;
    fn = maybeFn!;
  }

  const prevHoldCollector = __holdCollector;
  const prevInHold = __inHold;
  __holdCollector = [];
  __inHold = true;
  try {
    fn();
  } finally {
    const stmts = __holdCollector;
    __holdCollector = prevHoldCollector;
    __inHold = prevInHold;
    __holdOps.push({ key, stmts: stmts! });
  }
}

// --- Callback table ---
// Maps deterministic callback IDs to functions. Callback IDs are derived from
// entityId:propName, making them deterministic across DBSP retraction/insertion
// cycles so claims cancel properly. Only insertion body calls store the function
// (isInsertion guard), so stale closures from retraction bodies never overwrite
// fresh ones.

const __callbackTable = new Map<string, Function>();
// True while a fire_callback is executing. claim() is not allowed here
// because callback-produced claims have no lifecycle management (no automatic
// retraction). Use hold() instead.
let __inCallback = false;

// --- claim() and wish() ---

/**
 * Assert a fact — an ordered tuple of terms.
 *
 * Where it can be called:
 * - Top level: asserted as an initial fact
 * - Inside when() body: produces derived facts (auto-retracted by DBSP)
 * - Inside hold() callback: accumulated for the hold operation
 * - Inside event callbacks without hold(): **throws an error**
 *
 * @example
 * claim("omar", "is", "cool");
 * claim("counter", "count", 42);
 */
function claim(...terms: any[]): void {
  // Inside a hold() callback — collect for the hold operation
  if (__holdCollector !== null) {
    __holdCollector.push(terms);
    return;
  }
  // Inside an event callback (not in hold) — error
  if (__inCallback) {
    throw new Error(
      "claim() cannot be called directly inside a callback. " +
      "Wrap it in hold() — e.g., hold(() => { claim(...) })."
    );
  }
  if (__collector !== null) {
    // Inside a rule body being fired — accumulate
    __collector.push(terms);
  } else if (__registrationDepth === 0) {
    // Top-level claim during script evaluation
    __topLevelClaims.push(terms);
  }
  // Otherwise (inside a when body during registration) — ignore
}

/**
 * Alias for claim(). Convention: use wish() for desired states
 * that another system should fulfill.
 */
function wish(...terms: any[]): void {
  claim(...terms);
}

// --- when() ---

interface WhenMarker {
  __whenMarker: true;
  patterns: any[][];
  body: Function;
  capturedThis: string;
  __reservedOrder?: number;
}

const __pendingWhens: WhenMarker[] = [];
const __consumedWhens = new Set<WhenMarker>();

/**
 * Define a reactive rule. When facts matching the pattern(s) exist,
 * the body fires. When those facts are retracted, all claims produced
 * by the body are automatically retracted too.
 *
 * In JSX, returns an element that render() processes. Outside JSX,
 * finalize() registers it as an imperative rule.
 *
 * @example
 * // Single pattern
 * when(["counter", "count", $.value], ({ value }) => {
 *     claim("display", "text", `Count: ${value}`);
 * });
 *
 * // Two-pattern join
 * when([$.x, "is", "cool"], [$.x, "has", "mood", $.m], ({ x, m }) => { ... });
 *
 * // In JSX (returns element for render)
 * {when(["counter", "count", $.value], ({ value }) =>
 *     <Text>{`Count: ${value}`}</Text>
 * )}
 */
// Returns a marker object. Two paths consume it:
//   1. render() encounters it as a JSX child — registers the rule with the
//      correct parent from render's own parent stack.
//   2. finalize() finds unconsumed markers after script evaluation — registers
//      them as imperative rules with the $this captured at call time.
function when(...args: any[]): WhenMarker {
  const body = args.pop();
  const patterns: any[][] = args;

  const marker: WhenMarker = {
    __whenMarker: true,
    patterns,
    body,
    capturedThis: $this,
  };

  __pendingWhens.push(marker);
  return marker;
}

// Register a when-marker as a rule under the given parentId.
// Wraps the body to push parentId onto $this, and auto-renders JSX returns.
function __registerWhen(marker: WhenMarker, parentId: string): void {
  const wrappedBody = (bindings: any, isInsertion?: boolean) => {
    __thisStack.push(parentId);
    try {
      const result = marker.body(bindings);
      if (result && result.__jamElement) {
        // Use the reserved child order slot so the output appears at the
        // correct JSX source position relative to static siblings.
        if (marker.__reservedOrder !== undefined) {
          __childOrderOverride = marker.__reservedOrder;
        }
        render(result, parentId, isInsertion);
      }
    } finally {
      __thisStack.pop();
    }
  };

  const rule: RegisteredRule = { patterns: marker.patterns, body: wrappedBody, whens: [] };

  if (__registrationDepth === 0) {
    __rules.push(rule);
  } else {
    __ruleStack[__ruleStack.length - 1].whens.push(rule);
  }

  // Execute body in registration mode to discover nested when() calls.
  // Uses a proxy that returns "" for any binding access.
  // Save/restore child counters so the probe doesn't consume order slots
  // that the real body execution needs.
  const savedChildOrder = new Map(__childOrder);
  const savedChildCounters = new Map(__childCounters);
  __ruleStack.push(rule);
  __registrationDepth++;
  try {
    wrappedBody(new Proxy({}, { get() { return ""; } }));
  } catch {}
  __registrationDepth--;
  __ruleStack.pop();
  // Restore counters — probe side effects should not affect real execution.
  // Must clear first to remove keys added during the probe.
  __childOrder.clear();
  for (const [k, v] of savedChildOrder) __childOrder.set(k, v);
  __childCounters.clear();
  for (const [k, v] of savedChildCounters) __childCounters.set(k, v);
}

// Stack for tracking nested when() during registration
const __ruleStack: RegisteredRule[] = [];

// --- JSX support ---

interface JamElement {
  __jamElement: true;
  type: any;
  props: Record<string, any>;
  children: any[];
  key?: string;
}

/** Fragment symbol — groups children without a wrapper entity. */
const Fragment = Symbol("Fragment");

/**
 * JSX factory function. Normally called by the JSX transpiler, not directly.
 * Converts <Text font="title">Hello</Text> to h(Text, {font: "title"}, "Hello").
 */
function h(
  type: any,
  props: Record<string, any> | null,
  ...children: any[]
): JamElement {
  return {
    __jamElement: true as const,
    type,
    props: props || {},
    children: children.flat(),
    key: props?.key,
  };
}

// Track auto-incrementing child indices per parent during render.
// __childCounters generates keys for children without explicit keys.
// __childOrder tracks insertion order for sort keys, so children
// render in JSX source order rather than alphabetical key order.
const __childCounters: Map<string, number> = new Map();
const __childOrder: Map<string, number> = new Map();
// Override for the next child's order slot, used by when() bodies to place
// their output at the correct position reserved during initial render.
let __childOrderOverride: number | null = null;

/**
 * Render a JSX element tree into entity-attribute-value claims.
 * This is the entry point for UI programs.
 *
 * Each element produces claims:
 * - (entityId, "isa", type) — component type
 * - (entityId, propName, value) — properties
 * - (parentId, "child", key, entityId) — parent-child
 * - (entityId, "text", content) — text content
 *
 * Function props become callbacks stored in the callback table.
 * when() markers in the tree register reactive rules.
 *
 * @example
 * render(
 *     <VStack key="app">
 *         <Text key="title" font="title">Hello</Text>
 *     </VStack>
 * );
 */
function render(element: any, parentId?: string, isInsertion?: boolean): void {
  if (element == null) return;
  // String/number children are text content — handled by parent
  if (typeof element === "string" || typeof element === "number") return;

  // when() marker — register the rule with the current render parent.
  // Only during initial render (__collector === null). During DBSP body
  // execution the rules are already compiled; skip stale markers.
  if (element.__whenMarker) {
    if (__collector === null) {
      // Reserve a child order slot so when the rule fires later,
      // its children appear in the correct JSX source position.
      const parent = parentId ?? $this;
      const order = __childOrder.get(parent) ?? 0;
      __childOrder.set(parent, order + 1);
      (element as WhenMarker).__reservedOrder = order;
      __consumedWhens.add(element as WhenMarker);
      __registerWhen(element as WhenMarker, parentId ?? $this);
    }
    return;
  }

  if (Array.isArray(element)) {
    for (const child of element) {
      render(child, parentId, isInsertion);
    }
    return;
  }

  if (!element.__jamElement) return;

  const el = element as JamElement;

  if (el.type === Fragment) {
    for (const child of el.children) {
      render(child, parentId, isInsertion);
    }
    return;
  }

  // Function component — call it with props, render the result
  if (typeof el.type === "function") {
    const childProps = { ...el.props };
    if (el.children.length > 0) {
      childProps.children = el.children;
    }
    const result = el.type(childProps);
    // Propagate the key from the component call to the rendered result
    if (result && result.__jamElement && el.key && !result.key) {
      result.key = el.key;
    }
    render(result, parentId, isInsertion);
    return;
  }

  const parent = parentId ?? $this;
  const key =
    el.key ?? String(__childCounters.get(parent) ?? 0);
  if (!el.key) {
    __childCounters.set(parent, ((__childCounters.get(parent) ?? 0) + 1));
  }
  const entityId = `${parent}/${key}`;

  // Sort key preserves JSX source order: zero-padded counter prefix + key name.
  // Without this, children sort alphabetically by key ("detail" < "sidebar")
  // which breaks NavigationSplitView and other order-dependent layouts.
  // __childOrderOverride is set by when() rule bodies to place output at
  // the position reserved during initial render.
  let order: number;
  if (__childOrderOverride !== null) {
    order = __childOrderOverride;
    __childOrderOverride = null;
  } else {
    order = __childOrder.get(parent) ?? 0;
    __childOrder.set(parent, order + 1);
  }
  const sortKey = String(order).padStart(5, "0") + "#" + key;
  claim(parent, "child", sortKey, entityId);
  claim(entityId, "isa", el.type);

  for (const [k, v] of Object.entries(el.props)) {
    if (k === "key" || k === "children") continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "function") {
      // Function props are callbacks — use a deterministic ID based on
      // entityId:propName so DBSP retraction/insertion claims cancel properly.
      // Only store the function on insertion (not retraction) to avoid
      // stale closures overwriting fresh ones.
      const callbackId = `${entityId}:${k}`;
      if (isInsertion !== false) {
        __callbackTable.set(callbackId, v);
      }
      claim(entityId, k, callbackId);
      continue;
    }
    claim(entityId, k, v);
  }

  // Process children — push entityId to $this stack so nested elements
  // and when() markers get the right parent context
  __thisStack.push(entityId);
  __childCounters.set(entityId, 0);
  __childOrder.set(entityId, 0);
  try {
    for (const ch of el.children) {
      if (typeof ch === "string" || typeof ch === "number") {
        claim(entityId, "text", String(ch));
      } else {
        render(ch, entityId, isInsertion);
      }
    }
  } finally {
    __thisStack.pop();
  }
}

// --- Pattern matching (for callback refresh) ---

function __matchPattern(
  pattern: any[],
  fact: any[]
): Record<string, any> | null {
  if (pattern.length !== fact.length) return null;
  const bindings: Record<string, any> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    const f = fact[i];
    if (p && typeof p === "object" && p.__binding) {
      if (p.name in bindings && bindings[p.name] !== f) return null;
      bindings[p.name] = f;
    } else if (typeof p === "symbol") {
      // Wildcard
    } else if (p && typeof p === "object" && p.__or) {
      if (!p.values.includes(f)) return null;
    } else if (p !== f) {
      return null;
    }
  }
  return bindings;
}

// --- Host interface ---
// QuickJS host reads these after script evaluation to extract the program.

(globalThis as any).__jam = {
  rules: __rules,
  topLevelClaims: __topLevelClaims,
  setCollector(c: any[][] | null) {
    __collector = c;
  },
  getCollector(): any[][] {
    const result = __collector || [];
    __collector = null;
    return result;
  },
  // Read and clear pending hold ops
  getHoldOps(): HoldOp[] {
    return __holdOps.splice(0);
  },
  // Fire a callback by its deterministic ID, optionally passing data
  fireCallback(callbackId: string, data?: any): boolean {
    const cb = __callbackTable.get(callbackId);
    if (cb) {
      __inCallback = true;
      try {
        if (data !== undefined) {
          cb(data);
        } else {
          cb();
        }
      } finally {
        __inCallback = false;
      }
      return true;
    }
    return false;
  },
  // Register any when() markers not consumed by render().
  // These are imperative when() calls (not inside JSX).
  finalize() {
    for (const marker of __pendingWhens) {
      if (!__consumedWhens.has(marker)) {
        __registerWhen(marker, marker.capturedThis);
      }
    }
    __pendingWhens.length = 0;
    __consumedWhens.clear();
  },
  refreshCallbacks(factsJson: string) {
    const facts: any[][] = JSON.parse(factsJson);
    // Re-derive callbacks from current facts to fix stale closures
    // from DBSP retraction ordering
    __registrationDepth++;
    try {
      for (const rule of __rules) {
        for (const pattern of rule.patterns) {
          for (const fact of facts) {
            const bindings = __matchPattern(pattern, fact);
            if (bindings) {
              rule.body(bindings, true);
            }
          }
        }
      }
    } finally {
      __registrationDepth--;
    }
  },
};

// Re-export to globalThis so user scripts can use them without imports
// ($this is already set via Object.defineProperty above)
Object.assign(globalThis, {
  $, _, or, when, claim, wish, child, hold, h, render, Fragment,
});
