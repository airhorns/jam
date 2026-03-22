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

function when(...args: any[]): void {
  // Last argument is always the body function
  const body = args.pop();
  const patterns: any[][] = args;

  const rule: RegisteredRule = { patterns, body, whens: [] };

  if (__registrationDepth === 0) {
    __rules.push(rule);
  } else {
    // Nested when inside another when body during registration
    __ruleStack[__ruleStack.length - 1].whens.push(rule);
  }

  // Execute body in registration mode to discover nested when() calls.
  // Claims are ignored; only nested when() calls are captured.
  const dummyBindings = new Proxy(
    {},
    {
      get() {
        return "";
      },
    }
  );

  __ruleStack.push(rule);
  __registrationDepth++;
  try {
    body(dummyBindings);
  } catch {
    // Errors during registration-mode execution are expected
    // (e.g., method calls on dummy string values). Silently ignore.
  }
  __registrationDepth--;
  __ruleStack.pop();
}

// Stack for tracking nested when() during registration
const __ruleStack: RegisteredRule[] = [];

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
};

// Re-export to globalThis so user scripts can use them without imports
Object.assign(globalThis, { $, _, or, when, claim, wish });
