import { db, $, _, type Bindings, type Pattern, type Term } from "./db";
import {
  claim as baseClaim,
  remember as baseRemember,
  replace as baseReplace,
  forget as baseForget,
  transaction,
  when,
  whenever as baseWhenever,
} from "./primitives";
import { Fragment, h, injectVdom } from "./jsx";
import { mount } from "./renderer";
import { select } from "./select";

export interface ProgramAPI {
  db: typeof db;
  $: typeof $;
  _: typeof _;
  claim: (...terms: Term[]) => void;
  remember: (...terms: Term[]) => void;
  replace: (...terms: Term[]) => void;
  forget: (...terms: (Term | typeof _)[]) => void;
  when: (...patterns: Pattern[]) => Bindings[];
  whenever: (patterns: Pattern[], body: (matches: Bindings[]) => void) => () => void;
  transaction: typeof transaction;
  h: typeof h;
  Fragment: typeof Fragment;
  injectVdom: typeof injectVdom;
  mount: typeof mount;
  select: typeof select;
  [key: string]: unknown;
}

export type ProgramRunner = (api: ProgramAPI) => void | (() => void);

interface ProgramRecord {
  id: string;
  dispose: () => void;
}

interface ProgramOptions {
  api?: Record<string, unknown>;
}

const programRegistry = new Map<string, ProgramRecord>();

function addDisposer(target: Set<() => void>, disposer: void | (() => void)) {
  if (typeof disposer === "function") target.add(disposer);
}

export function createProgramAPI(extraApi: Record<string, unknown> = {}, disposers?: Set<() => void>): ProgramAPI {
  const autoDisposers = disposers ?? new Set<() => void>();

  const api: ProgramAPI = {
    db,
    $,
    _,
    claim: (...terms) => baseClaim(...terms),
    remember: (...terms) => baseRemember(...terms),
    replace: (...terms) => baseReplace(...terms),
    forget: (...terms) => baseForget(...terms),
    when,
    whenever: (patterns, body) => {
      const disposer = baseWhenever(patterns, body);
      autoDisposers.add(disposer);
      return disposer;
    },
    transaction,
    h,
    Fragment,
    injectVdom,
    mount: ((rootVnode: Parameters<typeof mount>[0], container: Parameters<typeof mount>[1]) => {
      const disposer = mount(rootVnode, container);
      autoDisposers.add(disposer);
      return disposer;
    }) as typeof mount,
    select,
    ...extraApi,
  };

  return Object.freeze(api);
}

export function registerProgram(id: string, runner: ProgramRunner, options: ProgramOptions = {}): () => void {
  removeProgram(id);

  const disposers = new Set<() => void>();
  const api = createProgramAPI(options.api ?? {}, disposers);
  const ownerId = `program:${id}`;

  let result: void | (() => void);
  try {
    result = db.withOwnerScope(ownerId, () => runner(api));
  } catch (error) {
    for (const disposer of Array.from(disposers).reverse()) {
      disposer();
    }
    db.revokeOwner(ownerId);
    throw error;
  }

  addDisposer(disposers, result);

  const dispose = () => {
    for (const disposer of Array.from(disposers).reverse()) {
      disposer();
    }
    db.revokeOwner(ownerId);
    programRegistry.delete(id);
  };

  programRegistry.set(id, { id, dispose });
  return dispose;
}

export function program(id: string, runner: ProgramRunner, options: ProgramOptions = {}): () => void {
  return registerProgram(id, runner, options);
}

export function removeProgram(id: string): void {
  const record = programRegistry.get(id);
  if (!record) return;
  record.dispose();
}

export function listPrograms(): string[] {
  return Array.from(programRegistry.keys()).sort();
}

export function loadProgramSource(id: string, source: string, options: ProgramOptions = {}): () => void {
  return registerProgram(
    id,
    (api) => {
      const fn = new Function("jam", `with(jam) { ${source} }`) as (jam: ProgramAPI) => void | (() => void);
      return fn(api);
    },
    options,
  );
}
