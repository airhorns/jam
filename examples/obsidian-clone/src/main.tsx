import { h } from "@jam/core/jsx";
import { db, mount } from "@jam/core";
import { ObsidianCloneApp } from "./app";

mount(<ObsidianCloneApp />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
