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

// --- Callback registry for event handling (onPress, etc.) ---
// Callbacks are stored during render() and replaced each time the when body
// re-fires via DBSP (which produces fresh closures with current values).
// Only registered during insertions, not retractions (controlled by __jam.isInsertion).

const __callbackRegistry = new Map<string, Function>();

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

function when(...args: any[]): any {
  // Last argument is always the body function
  const body = args.pop();
  const patterns: any[][] = args;

  // Check if the body returns JSX (returns a JamElement).
  // If so, return an element for the JSX tree — render() will register the rule
  // with the correct parent scope. No probe needed: just check the return type.
  const probeResult = (() => {
    __registrationDepth++;
    try {
      const dummyBindings = new Proxy({}, { get() { return 0; } });
      return body(dummyBindings);
    } catch {
      return undefined;
    } finally {
      __registrationDepth--;
    }
  })();

  if (probeResult && probeResult.__jamElement) {
    // JSX-returning body — return an element. render() handles rule registration.
    return h(when, { patterns, body });
  }

  // Imperative body — register the rule immediately
  const capturedThis = $this;
  const wrappedBody = (bindings: any) => {
    __thisStack.push(capturedThis);
    try {
      body(bindings);
    } finally {
      __thisStack.pop();
    }
  };

  const rule: RegisteredRule = { patterns, body: wrappedBody, whens: [] };

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
  // isInsertion defaults to true (initial render, fire_callback).
  // It's false only when DBSP calls the body for a retraction (-1 weight).
  const shouldRegisterCallbacks = isInsertion !== false;
  if (element == null) return;

  // String/number children are text content — handled by parent
  if (typeof element === "string" || typeof element === "number") return;

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

  // when() element — register a reactive rule at this point in the tree
  if (el.type === when) {
    const capturedParent = parentId ?? $this;
    const jsxBody = el.props.body as Function;
    const patterns = el.props.patterns as any[][];

    // wrappedBody receives (bindings, isInsertion) from DBSP via create_body_fn.
    // isInsertion is threaded through render() so callbacks are only registered
    // for insertions, not retractions (where DBSP's sort-order would give stale closures).
    const wrappedBody = (bindings: any, isInsertion?: boolean) => {
      __thisStack.push(capturedParent);
      try {
        const result = jsxBody(bindings);
        if (result && result.__jamElement) {
          render(result, capturedParent, isInsertion);
        }
      } finally {
        __thisStack.pop();
      }
    };

    const rule: RegisteredRule = { patterns, body: wrappedBody, whens: [] };

    if (__registrationDepth === 0) {
      __rules.push(rule);
    } else {
      __ruleStack[__ruleStack.length - 1].whens.push(rule);
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
    // Any function prop is a callback — store it in the registry.
    // Only register during insertions — retractions have stale closures.
    if (typeof v === "function") {
      if (shouldRegisterCallbacks) {
        __callbackRegistry.set(`${entityId}:${k}`, v);
      }
      claim(entityId, k, true);
      continue;
    }
    claim(entityId, k, v);
  }

  // Process children — push entityId to $this stack so when() captures the right scope
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
  // Fire a callback by entity ID and event name
  fireCallback(entityId: string, eventName: string): boolean {
    const key = `${entityId}:${eventName}`;
    const cb = __callbackRegistry.get(key);
    if (cb) {
      cb();
      return true;
    }
    return false;
  },
  // Re-derive callbacks for rules matching the given facts.
  // Called after fire_event steps to fix stale closures from DBSP retraction ordering.
  // This is a targeted refresh — one body call per matching rule, not a full re-render.
  refreshCallbacks(factsJson: string) {
    const facts: any[][] = JSON.parse(factsJson);
    __registrationDepth++;
    try {
      for (const rule of __rules) {
        for (const pattern of rule.patterns) {
          for (const fact of facts) {
            const bindings = __matchPattern(pattern, fact);
            if (bindings) {
              try {
                rule.body(bindings, true);
              } catch (e) {
                // Errors during refresh are non-fatal — some rules may not
                // support refresh (e.g., imperative when bodies).
              }
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
