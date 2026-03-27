import { h } from "@jam/core/jsx";
import { mount, db } from "@jam/core";
import { CounterApp } from "./app";
import "./styles.css";

mount(<CounterApp />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
