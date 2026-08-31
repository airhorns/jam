// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { drive, h, useComponentId } from "@jam/core";
import { render, resetUI } from "../testing";
import { useControllableState, useControllableList } from "../state";

beforeEach(() => {
  resetUI();
});

describe("driving useControllableState", () => {
  function Counter() {
    const [count] = useControllableState<number>("count", { defaultValue: 0 });
    return h("b", { "data-id": useComponentId() }, `${typeof count}:${String(count)}`);
  }

  it("coerces numeric strings to the number the state holds", () => {
    const { get } = render(h(Counter, null));
    const id = get("b").dataset.id!;
    drive(id, "count", "5");
    expect(get("b").textContent).toBe("number:5");
    drive(id, "count", 7);
    expect(get("b").textContent).toBe("number:7");
  });

  it("stores strings it cannot read as numbers verbatim", () => {
    const { get } = render(h(Counter, null));
    const id = get("b").dataset.id!;
    drive(id, "count", "abc");
    expect(get("b").textContent).toBe("string:abc");
    drive(id, "count", " ");
    expect(get("b").textContent).toBe("string: ");
  });

  it("takes driven values as-is when nothing has been stored or defaulted", () => {
    function Name() {
      const [name] = useControllableState<string>("name", {});
      return h("b", { "data-id": useComponentId() }, String(name));
    }
    const { get } = render(h(Name, null));
    drive(get("b").dataset.id!, "name", "x");
    expect(get("b").textContent).toBe("x");
  });
});

describe("resetting useControllableState", () => {
  let reset: ((empty: string) => void) | undefined;
  function Field(props: { onChange: (value: string) => void }) {
    const [value, , resetValue] = useControllableState<string>("value", { onChange: props.onChange });
    reset = resetValue;
    return h("b", { "data-id": useComponentId() }, String(value));
  }

  it("reports the empty value only when something was stored, and never after unmount", () => {
    const onChange = vi.fn();
    const { get, unmount } = render(h(Field, { onChange }));
    const id = get("b").dataset.id!;
    reset!("");
    expect(onChange).not.toHaveBeenCalled();

    drive(id, "value", "typed");
    expect(get("b").textContent).toBe("typed");
    reset!("");
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(get("b").textContent).toBe("undefined");
    reset!("");
    expect(onChange).toHaveBeenCalledTimes(2);

    drive(id, "value", "again");
    unmount();
    reset!("");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("driving useControllableList", () => {
  function Tags() {
    const [tags] = useControllableList("tags", { defaultValue: [] });
    return h("b", { "data-id": useComponentId() }, JSON.stringify(tags));
  }

  it("accepts a JSON array, a single item, an empty string or a non-string", () => {
    const { get } = render(h(Tags, null));
    const id = get("b").dataset.id!;
    drive(id, "tags", '["a","b"]');
    expect(get("b").textContent).toBe('["a","b"]');
    drive(id, "tags", "apple");
    expect(get("b").textContent).toBe('["apple"]');
    drive(id, "tags", '"quoted"');
    expect(get("b").textContent).toBe('["\\"quoted\\""]');
    drive(id, "tags", 3);
    expect(get("b").textContent).toBe('["3"]');
    drive(id, "tags", "");
    expect(get("b").textContent).toBe("[]");
  });
});
