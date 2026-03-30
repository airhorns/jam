// Benchmarks for VDOM emission and rendering.
//
// These measure the cost of:
//   - emitVdom: JSX → fact claims in the DB
//   - select(): CSS selector matching against VDOM facts
//   - buildVdomIndex: building the tree index from facts
//   - Full render cycle: component execution → emit → patch

import { bench, describe, beforeEach } from "vitest";
import { FactDB, $, _ } from "../db";
import { db } from "../db";
import { h, emitVdom } from "../jsx";
import type { VChild } from "../jsx";
import { select, buildVdomIndex } from "../select";

// --- Helpers ---

/** Build a VNode tree of depth d with b children per node. */
function makeTree(depth: number, breadth: number, prefix = "node"): VChild {
  if (depth === 0) {
    return h("span", { class: "leaf" }, `text-${prefix}`);
  }
  const children: VChild[] = [];
  for (let i = 0; i < breadth; i++) {
    children.push(makeTree(depth - 1, breadth, `${prefix}-${i}`));
  }
  return h("div", { class: `level-${depth}` }, ...children);
}

/** Build a flat list of N items (like a todo list). */
function makeList(n: number): VChild {
  const items: VChild[] = [];
  for (let i = 0; i < n; i++) {
    items.push(
      h("li", { key: i, id: `item-${i}`, class: "list-item" },
        h("span", { class: "label" }, `Item ${i}`),
        h("button", { class: "action" }, "x"),
      ),
    );
  }
  return h("ul", { class: "list" }, ...items);
}

/** Populate DB with VDOM facts simulating n elements. */
function populateVdomFacts(n: number): void {
  for (let i = 0; i < n; i++) {
    db.assert(`el-${i}`, "tag", i % 3 === 0 ? "div" : i % 3 === 1 ? "span" : "li");
    db.assert(`el-${i}`, "class", "item");
    if (i % 5 === 0) db.assert(`el-${i}`, "class", "highlighted");
    db.assert(`el-${i}`, "prop", "data-idx", i);
    if (i > 0) {
      db.assert(`el-${Math.floor((i - 1) / 3)}`, "child", i % 3, `el-${i}`);
    }
  }
}

// ============================================================================
// EMIT VDOM
// ============================================================================

describe("emitVdom — JSX to facts", () => {
  beforeEach(() => db.clear());

  bench("emit single element", () => {
    db.clear();
    emitVdom(h("div", { class: "app" }, "hello"), "__root", 0);
  });

  bench("emit flat list of 50 items (150 elements)", () => {
    db.clear();
    emitVdom(makeList(50), "__root", 0);
  });

  bench("emit flat list of 200 items (600 elements)", () => {
    db.clear();
    emitVdom(makeList(200), "__root", 0);
  });

  bench("emit tree depth=3 breadth=4 (85 elements)", () => {
    db.clear();
    emitVdom(makeTree(3, 4), "__root", 0);
  });

  bench("emit tree depth=4 breadth=3 (121 elements)", () => {
    db.clear();
    emitVdom(makeTree(4, 3), "__root", 0);
  });

  bench("re-emit 50-item list (clear + emit, simulating re-render)", () => {
    const vnode = makeList(50);
    // Initial emit
    emitVdom(vnode, "__root", 0);
    const keys = new Set(db.facts.keys());
    // Bench the re-emit
    for (const key of keys) db.deleteByKey(key);
    emitVdom(vnode, "__root", 0);
  });
});

// ============================================================================
// BUILD VDOM INDEX (used by select and renderer)
// ============================================================================

describe("buildVdomIndex", () => {
  beforeEach(() => db.clear());

  bench("index 100 elements (~400 facts)", () => {
    populateVdomFacts(100);
    buildVdomIndex();
  });

  bench("index 500 elements (~2000 facts)", () => {
    populateVdomFacts(500);
    buildVdomIndex();
  });
});

// ============================================================================
// SELECT — CSS selector queries
// ============================================================================

describe("select()", () => {
  beforeEach(() => {
    db.clear();
    populateVdomFacts(200);
  });

  bench("select by class (.item) — matches ~200", () => {
    select(".item");
  });

  bench("select by class (.highlighted) — matches ~40", () => {
    select(".highlighted");
  });

  bench("select by tag (div) — matches ~67", () => {
    select("div");
  });

  bench("select compound (div.highlighted) — matches ~14", () => {
    select("div.highlighted");
  });

  bench("select by id (#el-42)", () => {
    // Add an id prop to one element
    db.assert("el-42", "prop", "id", "el-42");
    select("#el-42");
  });

  bench("select descendant (div .item)", () => {
    select("div .item");
  });

  bench("select child (div > span)", () => {
    select("div > span");
  });
});

// ============================================================================
// FULL CYCLE: component + emit + facts
// ============================================================================

describe("full render cycle (component → emit)", () => {
  beforeEach(() => db.clear());

  bench("component with 10 todos: execute + emit", () => {
    // Populate app state
    for (let i = 0; i < 10; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
      db.assert("todo", i, "done", i % 3 === 0);
    }

    // Simulate component execution
    function TodoApp() {
      const items = db.query(
        ["todo", $.id, "title", $.title],
        ["todo", $.id, "done", $.done],
      );
      return h("ul", null,
        ...items.map(({ id, title, done }) =>
          h("li", { key: id, id: `todo-${id}`, class: done ? "done" : "" },
            h("span", null, title as string),
          ),
        ),
      );
    }

    db.clear();
    for (let i = 0; i < 10; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
      db.assert("todo", i, "done", i % 3 === 0);
    }
    const vnode = TodoApp();
    emitVdom(vnode, "__root", 0);
  });

  bench("component with 100 todos: execute + emit", () => {
    for (let i = 0; i < 100; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
      db.assert("todo", i, "done", i % 3 === 0);
    }

    function TodoApp() {
      const items = db.query(
        ["todo", $.id, "title", $.title],
        ["todo", $.id, "done", $.done],
      );
      return h("ul", null,
        ...items.map(({ id, title, done }) =>
          h("li", { key: id, id: `todo-${id}`, class: done ? "done" : "" },
            h("span", null, title as string),
          ),
        ),
      );
    }

    const vnode = TodoApp();
    emitVdom(vnode, "__root", 0);
  });
});
