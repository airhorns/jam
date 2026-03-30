import { h } from "@jam/core/jsx";
import { mount, db, persist } from "@jam/core";
import { TodoApp } from "./app";
import "./styles.css";

// Independent programs
import "./programs/strikethrough";

async function start() {
  // Restore persisted facts from SQLite/OPFS, then mount
  await persist({ name: "folk-todo" });

  mount(<TodoApp />, document.getElementById("app")!);
}

start();

// Expose db on window for debugging
if (typeof window !== "undefined") {
  (window as any).__db = db;
}
