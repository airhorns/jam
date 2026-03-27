import { describe, it, expect, beforeEach } from "vitest";
import { db, $ } from "../db";
import { h, injectVdom } from "../jsx";

beforeEach(() => {
  db.clear();
});

describe("injectVdom", () => {
  it("injects a text node into a parent", () => {
    // Simulate a parent element already in the DB
    db.assert("my-el", "tag", "div");

    // Inject a text child at index 1000
    injectVdom("my-el", 1000, "hello world");

    // Should have a child fact and text facts
    const children = db.query(["my-el", "child", $.idx, $.child]);
    const textChild = children.find(c => c.idx === 1000);
    expect(textChild).toBeTruthy();

    const textId = textChild!.child as string;
    expect(db.query([textId, "tag", "__text"])).toHaveLength(1);
    expect(db.query([textId, "text", "hello world"])).toHaveLength(1);
  });

  it("injects a JSX element into a parent", () => {
    db.assert("my-el", "tag", "div");

    injectVdom("my-el", 1000, h("span", { class: "badge" }, "3"));

    const children = db.query(["my-el", "child", 1000, $.child]);
    expect(children).toHaveLength(1);

    const childId = children[0].child as string;
    expect(db.query([childId, "tag", "span"])).toHaveLength(1);
    expect(db.query([childId, "class", "badge"])).toHaveLength(1);
  });

  it("injects multiple children", () => {
    db.assert("my-el", "tag", "div");

    injectVdom("my-el", 100,
      h("span", null, "first"),
      h("span", null, "second"),
    );

    const children = db.query(["my-el", "child", $.idx, $.child]);
    const injected = children.filter(c => (c.idx as number) >= 100);
    expect(injected).toHaveLength(2);
  });

  it("doesn't conflict with existing children at low indices", () => {
    db.assert("my-el", "tag", "div");
    // Simulate component children at 0, 1, 2
    db.assert("my-el", "child", 0, "existing-0");
    db.assert("my-el", "child", 1, "existing-1");

    // Inject at high index
    injectVdom("my-el", 1000, h("span", { class: "injected" }));

    // All children present — originals + injected
    const children = db.query(["my-el", "child", $.idx, $.child]);
    expect(children).toHaveLength(3);
  });

  it("works with id prop for globally addressable injected elements", () => {
    db.assert("my-el", "tag", "div");

    injectVdom("my-el", 1000, h("span", { id: "my-badge", class: "badge" }, "!"));

    // The injected element should be addressable by its id
    expect(db.query(["my-badge", "tag", "span"])).toHaveLength(1);
    expect(db.query(["my-badge", "class", "badge"])).toHaveLength(1);
  });
});
