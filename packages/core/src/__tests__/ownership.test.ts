import { describe, it, expect, beforeEach } from "vitest";
import * as core from "../index";
import { db, $, _ } from "../db";
import {
  claim,
  forget,
  remember,
  replace,
  when,
  whenever,
} from "../primitives";

describe("ownership scopes", () => {
  beforeEach(() => {
    db.clear();
  });

  it("keeps a fact alive until all owning scopes are revoked", () => {
    db.withOwnerScope("scope:a", () => {
      db.assert("shared", "fact");
    });
    db.withOwnerScope("scope:b", () => {
      db.assert("shared", "fact");
    });

    expect(db.query(["shared", $.value])).toEqual([{ value: "fact" }]);

    db.revokeOwner("scope:a");
    expect(db.query(["shared", $.value])).toEqual([{ value: "fact" }]);

    db.revokeOwner("scope:b");
    expect(db.query(["shared", $.value])).toEqual([]);
  });

  it("revokes child scopes recursively when a parent owner is revoked", () => {
    db.withOwnerScope("parent", () => {
      db.assert("parent", "value");
      db.withOwnerScope("child", () => {
        db.assert("child", "value");
      });
    });

    expect(db.query([$.entity, $.value])).toContainEqual({
      entity: "parent",
      value: "value",
    });
    expect(db.query([$.entity, $.value])).toContainEqual({
      entity: "child",
      value: "value",
    });

    db.revokeOwner("parent");

    expect(db.query([$.entity, $.value])).toEqual([]);
  });

  it("whenever uses owned child scopes so reruns revoke previous derived facts", () => {
    db.withOwnerScope("program:test", () => {
      whenever([["todo", $.id, "done", true]], (matches) => {
        for (const { id } of matches) {
          claim("derived", id, "active");
        }
      });
    });

    remember("todo", 1, "done", true);
    expect(when(["derived", $.id, $.status])).toEqual([
      { id: 1, status: "active" },
    ]);

    forget("todo", 1, "done", true);
    expect(when(["derived", $.id, $.status])).toEqual([]);
  });

  it("forget clears matching facts regardless of owner", () => {
    db.withOwnerScope("scope:a", () => {
      db.assert("item", 1, "status", "a");
    });
    db.withOwnerScope("scope:b", () => {
      db.assert("item", 1, "status", "b");
    });

    forget("item", 1, "status", _);
    expect(when(["item", 1, "status", $.value])).toEqual([]);
  });

  it("claim is scoped while remember survives owner revocation", () => {
    db.withOwnerScope("program:test", () => {
      claim("scoped", "value");
      remember("durable", "value");
    });

    expect(when(["scoped", $.value])).toEqual([{ value: "value" }]);
    expect(when(["durable", $.value])).toEqual([{ value: "value" }]);

    db.revokeOwner("program:test");

    expect(when(["scoped", $.value])).toEqual([]);
    expect(when(["durable", $.value])).toEqual([{ value: "value" }]);
  });

  it("replace overwrites the durable value for a singleton slot", () => {
    remember("ui", "theme", "light");
    replace("ui", "theme", "dark");

    expect(when(["ui", "theme", $.name])).toEqual([{ name: "dark" }]);
  });
});

describe("public api surface", () => {
  it("exports claim/remember/replace/forget and not assert/insert/drop/set", () => {
    expect(typeof core.claim).toBe("function");
    expect(typeof core.remember).toBe("function");
    expect(typeof core.replace).toBe("function");
    expect(typeof core.forget).toBe("function");
    expect("assert" in core).toBe(false);
    expect("insert" in core).toBe(false);
    expect("drop" in core).toBe(false);
    expect("set" in core).toBe(false);
    expect("retract" in core).toBe(false);
  });
});
