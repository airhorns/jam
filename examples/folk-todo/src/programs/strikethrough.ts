// Strikethrough Program — by "another author"
//
// This program knows NOTHING about TodoItem's implementation.
// It only knows:
//   1. The fact schema: ["todo", id, "done", true/false]
//   2. The addressing convention: TodoItem keys its root element by todo id → "k:{id}"
//
// It claims an extra CSS class on done todo elements. The renderer merges
// this with the component's own classes. TodoItem never sees this claim.

import { $, claim, whenever } from "../lib";

export const dispose = whenever(
  [["todo", $.id, "done", true]],
  (doneTodos) => {
    for (const { id } of doneTodos) {
      claim(`k:${id}`, "class", "strikethrough");
    }
  },
);
