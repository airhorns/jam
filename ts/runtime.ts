// ============================================================================
// Jam Runtime — executes in QuickJS
//
// This file provides the runtime implementations of $, _, or(), when(),
// claim(), and wish(). The TypeScript types in jam.d.ts provide edit-time
// checking; this file provides the runtime behavior.
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

// --- $this: scoped entity identity (like Folk's $this) ---

const __thisStack: string[] = ["root"];

Object.defineProperty(globalThis, "$this", {
  get() {
    return __thisStack[__thisStack.length - 1];
  },
});

// Declare $this for TypeScript (the actual getter is set above)
declare var $this: string;

// --- child(): scoped nesting with auto parent-child claims ---

function child(name: string, fn: () => void): void {
  const parent = $this;
  const childId = `${parent}/${name}`;
  claim(parent, "child", name, childId);
  __thisStack.push(childId);
  try {
    fn();
  } finally {
    __thisStack.pop();
  }
}

// --- $ proxy: creates binding markers ---

const $: any = new Proxy(
  {},
  {
    get(_target: any, prop: string | symbol): BindingMarker | undefined {
      if (typeof prop === "symbol") return undefined;
      return { __binding: true, name: prop };
    },
  }
);

// --- _ wildcard ---

const _ = Symbol("wildcard");

// --- or() ---

function or(...values: any[]): OrMarker {
  return { __or: true, values };
}

// --- hold(): persistent mutable state ---

interface HoldOp {
  key: string;
  stmts: any[][];
}

const __holdOps: HoldOp[] = [];

function hold(key: string, stmts: any[][]): void {
  __holdOps.push({ key, stmts });
}

// --- Callback table: maps deterministic callback IDs to functions ---
// Callback IDs are derived from entityId:propName, making them deterministic
// across DBSP retraction/insertion cycles so claims cancel properly.
// Only insertion body calls store the function (isInsertion guard), so
// stale closures from retraction bodies never overwrite fresh ones.

const __callbackTable = new Map<string, Function>();

// --- claim() and wish() ---

function claim(...terms: any[]): void {
  if (__collector !== null) {
    // Inside a rule body being fired — accumulate
    __collector.push(terms);
  } else if (__registrationDepth === 0) {
    // Top-level claim during script evaluation
    __topLevelClaims.push(terms);
  }
  // Otherwise (inside a when body during registration) — ignore
}

function wish(...terms: any[]): void {
  claim(...terms);
}

// --- when() ---
// Returns a marker object. Two paths consume it:
//   1. render() encounters it as a JSX child — registers the rule with the
//      correct parent from render's own parent stack.
//   2. finalize() finds unconsumed markers after script evaluation — registers
//      them as imperative rules with the $this captured at call time.
// No probe needed. No mutable parent refs.

interface WhenMarker {
  __whenMarker: true;
  patterns: any[][];
  body: Function;
  capturedThis: string;
}

// All markers created during evaluation, and the set consumed by render()
const __pendingWhens: WhenMarker[] = [];
const __consumedWhens = new Set<WhenMarker>();

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
  __ruleStack.push(rule);
  __registrationDepth++;
  try {
    wrappedBody(new Proxy({}, { get() { return ""; } }));
  } catch {}
  __registrationDepth--;
  __ruleStack.pop();
}

// Stack for tracking nested when() during registration
const __ruleStack: RegisteredRule[] = [];

// --- JSX support: h(), render(), Fragment ---

interface JamElement {
  __jamElement: true;
  type: any;
  props: Record<string, any>;
  children: any[];
  key?: string;
}

const Fragment = Symbol("Fragment");

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

// Track auto-incrementing child indices per parent during render
const __childCounters: Map<string, number> = new Map();

function render(element: any, parentId?: string, isInsertion?: boolean): void {
  if (element == null) return;

  // String/number children are text content — handled by parent
  if (typeof element === "string" || typeof element === "number") return;

  // when() marker — register the rule with the current render parent.
  // Only during initial render (__collector === null). During DBSP body
  // execution the rules are already compiled; skip stale markers.
  if (element.__whenMarker) {
    if (__collector === null) {
      __consumedWhens.add(element as WhenMarker);
      __registerWhen(element as WhenMarker, parentId ?? $this);
    }
    return;
  }

  // Array of elements (from Fragment or map)
  if (Array.isArray(element)) {
    for (const child of element) {
      render(child, parentId, isInsertion);
    }
    return;
  }

  if (!element.__jamElement) return;

  const el = element as JamElement;

  // Fragment — render children directly under the parent
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
    // Propagate the key from the component call to the rendered result.
    if (result && result.__jamElement && el.key && !result.key) {
      result.key = el.key;
    }
    render(result, parentId, isInsertion);
    return;
  }

  // Built-in element (string type like "VStack", "Text", etc.)
  const parent = parentId ?? $this;
  const key =
    el.key ?? String(__childCounters.get(parent) ?? 0);
  if (!el.key) {
    __childCounters.set(parent, ((__childCounters.get(parent) ?? 0) + 1));
  }
  const entityId = `${parent}/${key}`;

  // Register as child of parent
  claim(parent, "child", key, entityId);

  // Set component type
  claim(entityId, "isa", el.type);

  // Set properties from props
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "key" || k === "children") continue;
    // Function props are callbacks — use a deterministic ID based on
    // entityId:propName so DBSP retraction/insertion claims cancel properly.
    // Only store the function on insertion (not retraction) to avoid
    // stale closures overwriting fresh ones.
    if (typeof v === "function") {
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

// --- Exports for host access ---
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
  // Hold operations: read and clear pending hold ops
  getHoldOps(): HoldOp[] {
    return __holdOps.splice(0);
  },
  // Fire a callback by its callback ID
  fireCallback(callbackId: string): boolean {
    const cb = __callbackTable.get(callbackId);
    if (cb) {
      cb();
      return true;
    }
    return false;
  },
  // Finalize: register any when() markers not consumed by render().
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
};

// Re-export to globalThis so user scripts can use them without imports
// ($this is already set via Object.defineProperty above)
Object.assign(globalThis, {
  $, _, or, when, claim, wish, child, hold, h, render, Fragment,
});
