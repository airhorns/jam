// Strikethrough Program — by "another author"
//
// This program knows NOTHING about TodoItem's implementation.
// It only knows:
//   1. The fact schema: ["todo", id, "done", true/false]
//   2. The addressing convention: todo items have id="todo-{id}"
//
// It claims an extra CSS class on done todo elements. The renderer merges
// this with the component's own classes. TodoItem never sees this claim.

import { program } from "@jam/core";

export const dispose = program("folk-todo/strikethrough", ({ $, claim, whenever }) =>
  whenever(
    [["todo", $.id, "done", true]],
    (doneTodos) => {
      for (const { id } of doneTodos) {
        claim(`todo-${id}`, "class", "strikethrough");
      }
    },
  ));
