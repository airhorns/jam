import { h } from "@jam/core/jsx";
import { db, mount } from "@jam/core";
import { TrelloCloneApp } from "./app";
import { initializeTrelloClone } from "./state";
import "./styles.css";

initializeTrelloClone();
mount(<TrelloCloneApp />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
