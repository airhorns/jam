// Bridge shim — entry point for the IIFE bundle loaded into JavaScriptCore.
//
// This file sets up the Jam runtime in native mode and exposes a global
// JamNative object that Swift calls to load programs, fire events, and
// observe fact changes.

import "./polyfills";

import {
  db,
  $,
  _,
  forget,
  remember,
  replace,
  when,
  whenever,
  transaction,
  loadProgramSource,
  registerProgram,
  removeProgram,
} from "@jam/core";
import { h, Fragment, emitVdom } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import * as ui from "@jam/ui";
import { setNativeMode } from "@jam/ui";
import { autorun, reaction, runInAction } from "mobx";

// Enable native rendering mode — styled() emits style facts, not CSS classes
setNativeMode(true);

// --- Fact observation ---

let factsChangedCallback: ((json: string) => void) | null = null;
let observeDisposer: (() => void) | null = null;

function startObserving() {
  if (observeDisposer) return;
  observeDisposer = autorun(() => {
    // Read all facts (this tracks the observable map)
    const allFacts = Array.from(db.facts.values());
    if (factsChangedCallback) {
      factsChangedCallback(JSON.stringify(allFacts));
    }
  });
}

// --- Program management ---

/**
 * Phase 1 only mount — executes the component tree and emits VDOM facts
 * into the database, without DOM reconciliation (Phase 2).
 * This mirrors packages/core/src/renderer.ts mount() but skips the DOM patch.
 */
function nativeMount(rootVnode: VChild, rootId: string = "dom"): () => void {
  const mountOwner = db.createChildOwner(db.getCurrentOwnerId(), "native-mount");

  const emitDisposer = reaction(
    () => {
      // TRACKED: execute component tree
      let vnode: VChild = rootVnode;
      if (typeof rootVnode === "object" && rootVnode !== null && "__vnode" in rootVnode) {
        const rn = rootVnode as VNode;
        if (typeof rn.tag === "function") {
          const propsWithChildren = rn.children.length > 0
            ? { ...rn.props, children: rn.children.length === 1 ? rn.children[0] : rn.children }
            : rn.props;
          vnode = (rn.tag as Function)(propsWithChildren);
        }
      }
      return vnode;
    },
    (vnode) => {
      // EFFECT: clear old claims and emit new ones
      runInAction(() => {
        db.revokeOwner(mountOwner);
        db.withOwnerScope(mountOwner, () => {
          db.emitCollector = new Set();
          emitVdom(vnode, rootId, 0);
          db.emitCollector = null;
        });
      });
    },
    { fireImmediately: true, equals: () => false },
  );

  return () => {
    emitDisposer();
    runInAction(() => {
      db.revokeOwner(mountOwner);
    });
  };
}

// --- Native action bridge ---

/**
 * __callNative is registered by Swift as a @convention(block) closure.
 * JS calls it to trigger native actions (network requests, etc.)
 * without polling. Swift registers it before loading any programs.
 *
 * Signature: __callNative(action: string, paramsJson?: string) => string
 */
function callNative(action: string, params?: Record<string, unknown>): unknown {
  const nativeFn = (globalThis as any).__callNative;
  if (!nativeFn) {
    console.warn(`callNative("${action}"): __callNative not registered by Swift`);
    return undefined;
  }
  const paramsJson = params ? JSON.stringify(params) : undefined;
  const resultJson = nativeFn(action, paramsJson);
  if (resultJson && typeof resultJson === "string") {
    try { return JSON.parse(resultJson); } catch { return resultJson; }
  }
  return resultJson;
}

// --- Jam API for user programs ---

const nativeProgramApi: Record<string, unknown> = {
  // Native bridge
  callNative,
  // All UI exports (createJamUI, styled, components, etc.)
  ...ui,
};

// === Global Bridge API ===

(globalThis as any).JamNative = {
  /**
   * Register the Swift callback for fact changes.
   * Swift calls this once on init, passing a function that receives JSON.
   */
  onFactsChanged(callback: (json: string) => void) {
    factsChangedCallback = callback;
    startObserving();
  },

  /**
   * Load and execute a Jam program (imperative style).
   * The program source has access to all Jam APIs via `with(jam)`.
   * Use this for programs that call remember/whenever directly.
   */
  loadProgram(id: string, source: string): string {
    try {
      loadProgramSource(id, source, { api: nativeProgramApi });
      return "ok";
    } catch (e: any) {
      return `error: ${e.message}`;
    }
  },

  /**
   * Mount a program that returns a component tree (declarative style).
   * The source is executed as a program body. The last expression should be a
   * VNode or component function — use `loadProgram` for the setup code,
   * then `mountProgram` with just the final component expression.
   *
   * For multi-statement programs, use loadProgram() for setup and pass
   * just the component expression to mountProgram().
   */
  mountProgram(id: string, source: string, rootId?: string): string {
    try {
      registerProgram(id, (api) => {
        // Try as an expression first (simple case: just a component/VNode)
        let result: any;
        try {
          const fn = new Function("jam", `with(jam) { return (${source}); }`);
          result = fn(api);
        } catch {
          // If that fails, execute as statements and eval the last line
          const lines = source.trim().split("\n");
          const lastLine = lines.pop()!;
          const setup = lines.join("\n");
          const fn = new Function("jam", `with(jam) { ${setup}\n return (${lastLine}); }`);
          result = fn(api);
        }

        if (result && typeof result === "object" && "__vnode" in result) {
          return nativeMount(result, rootId || "dom");
        }
        if (typeof result === "function") {
          return nativeMount(h(result, {}), rootId || "dom");
        }
        return undefined;
      }, { api: nativeProgramApi });
      return "ok";
    } catch (e: any) {
      return `error: ${e.message}`;
    }
  },

  /**
   * Dispose a loaded program and forget its emitted facts.
   */
  disposeProgram(id: string) {
    removeProgram(id);
  },

  /**
   * Fire an event handler on an entity.
   * Called by Swift when user interacts with a rendered element.
   */
  fireEvent(entityId: string, eventName: string, data?: string): string {
    try {
      const refKey = `${entityId}:handler:${eventName}`;
      const handler = db.getRef(refKey) as Function | undefined;
      if (handler) {
        if (data !== undefined) {
          handler({ target: { value: data }, data });
        } else {
          handler({});
        }
        return "ok";
      }
      return "error: no handler found";
    } catch (e: any) {
      return `error: ${e.message}`;
    }
  },

  /**
   * Get current facts snapshot as JSON.
   */
  getCurrentFacts(): string {
    return JSON.stringify(Array.from(db.facts.values()));
  },

  /**
   * Assert a fact from Swift side.
   * @param termsJson — JSON array of terms, e.g. '["counter", "count", 0]'
   */
  assertFact(termsJson: string) {
    const terms = JSON.parse(termsJson);
    runInAction(() => remember(...terms));
  },

  /**
   * Retract a fact from Swift side.
   */
  removeFact(termsJson: string) {
    const terms = JSON.parse(termsJson);
    runInAction(() => forget(...terms));
  },

  /**
   * Replace the durable value for a fact prefix from Swift side.
   */
  setFact(termsJson: string) {
    const terms = JSON.parse(termsJson);
    runInAction(() => replace(...terms));
  },
};
