import { h } from "./lib/jsx";
import { mount, db } from "./lib";
import { TodoApp } from "./app";
import "./styles.css";

// Independent programs — each reacts to the shared fact database.
// Like placing new papers on the folk table.
import "./programs/strikethrough";

// Mount the app
mount(<TodoApp />, document.getElementById("app")!);

// Expose db on window for debugging
if (typeof window !== "undefined") {
  (window as any).__db = db;
}
