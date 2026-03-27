// Strikethrough Program — by "another author"
//
// This program knows NOTHING about TodoItem or how it renders.
// It only knows the fact schema: ["todo", id, "done", true/false].
//
// Folk model: react to facts in the shared database, produce a visible
// side effect. Here we inject a <style> tag declaring that done todos
// should have their titles struck through. When no todos are done,
// the style is removed — the decoration only exists while the facts do.

import { whenever, $ } from "../lib";

let styleEl: HTMLStyleElement | null = null;

export const dispose = whenever(
  [["todo", $.id, "done", true]],
  (doneTodos) => {
    if (doneTodos.length > 0) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.setAttribute("data-program", "strikethrough");
        document.head.appendChild(styleEl);
      }
      styleEl.textContent =
        ".todo-item.done .title { text-decoration: line-through; color: #aaa; }";
    } else {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    }
  },
);
