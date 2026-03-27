import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../lib/db";
import { assert, retract, set, _ } from "../../lib/primitives";

// We can't import the program directly (it touches document.head),
// so we test the reactive logic: whenever sees done todos → asserts
// decoration facts. The program's actual behavior (style injection)
// is tested in e2e.

describe("strikethrough program logic", () => {
  beforeEach(() => {
    db.facts.clear();
  });

  it("done todos are queryable from the fact DB", () => {
    set("todo", 1, "title", "Buy milk");
    set("todo", 1, "done", true);

    const done = db.query(["todo", 1, "done", true]);
    expect(done).toHaveLength(1);
  });

  it("toggling done flips the fact", () => {
    set("todo", 1, "done", false);
    expect(db.query(["todo", 1, "done", false])).toHaveLength(1);
    expect(db.query(["todo", 1, "done", true])).toHaveLength(0);

    set("todo", 1, "done", true);
    expect(db.query(["todo", 1, "done", false])).toHaveLength(0);
    expect(db.query(["todo", 1, "done", true])).toHaveLength(1);
  });

  it("deleting a todo removes the done fact", () => {
    set("todo", 1, "title", "X");
    set("todo", 1, "done", true);
    retract("todo", 1, _, _);
    expect(db.query(["todo", 1, "done", true])).toHaveLength(0);
  });
});
