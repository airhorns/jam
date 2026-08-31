/* tslint:disable */
/* eslint-disable */

export class JamEngine {
    free(): void;
    [Symbol.dispose](): void;
    apply(ops: Uint32Array): void;
    create_owner(parent: number): number;
    drain(): Uint32Array;
    fact_count(): number;
    facts(scope: number, pattern: Uint32Array): Uint32Array;
    has_fact(terms: Uint32Array): boolean;
    index_count(): number;
    intern_num(n: number): number;
    intern_str(s: string): number;
    constructor();
    owner_exists(owner: number): boolean;
    query(clauses: Uint32Array): Uint32Array;
    query_count(): number;
    register(clauses: Uint32Array): number;
    release(id: number): boolean;
    rows(id: number): Uint32Array;
    scope_of(terms: Uint32Array): number;
    set_fact_events(level: number): void;
    /**
     * Ids handed out so far, including freed ones awaiting reuse.
     */
    term_capacity(): number;
    /**
     * Live terms.
     */
    term_count(): number;
    /**
     * 0 string, 1 number, 2 boolean, 3 unknown id.
     */
    term_kind(id: number): number;
    term_num(id: number): number;
    term_str(id: number): string | undefined;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_jamengine_free: (a: number, b: number) => void;
    readonly jamengine_apply: (a: number, b: number, c: number, d: number) => void;
    readonly jamengine_create_owner: (a: number, b: number) => number;
    readonly jamengine_drain: (a: number, b: number) => void;
    readonly jamengine_fact_count: (a: number) => number;
    readonly jamengine_facts: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly jamengine_has_fact: (a: number, b: number, c: number) => number;
    readonly jamengine_index_count: (a: number) => number;
    readonly jamengine_intern_num: (a: number, b: number) => number;
    readonly jamengine_intern_str: (a: number, b: number, c: number) => number;
    readonly jamengine_new: () => number;
    readonly jamengine_owner_exists: (a: number, b: number) => number;
    readonly jamengine_query: (a: number, b: number, c: number, d: number) => void;
    readonly jamengine_query_count: (a: number) => number;
    readonly jamengine_register: (a: number, b: number, c: number, d: number) => void;
    readonly jamengine_release: (a: number, b: number) => number;
    readonly jamengine_rows: (a: number, b: number, c: number) => void;
    readonly jamengine_scope_of: (a: number, b: number, c: number) => number;
    readonly jamengine_set_fact_events: (a: number, b: number) => void;
    readonly jamengine_term_capacity: (a: number) => number;
    readonly jamengine_term_count: (a: number) => number;
    readonly jamengine_term_kind: (a: number, b: number) => number;
    readonly jamengine_term_num: (a: number, b: number) => number;
    readonly jamengine_term_str: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
