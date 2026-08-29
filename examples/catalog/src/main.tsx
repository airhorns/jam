import { h } from "@jam/core/jsx";
import { mount, db } from "@jam/core";
import { setupUI } from "./config";
import { App, initCatalogState, applyState } from "./app";
import { registry } from "./registry";

setupUI();
initCatalogState();
mount(<App />, document.getElementById("app")!);

// Hooks for Playwright and manual poking.
(window as any).__db = db;
(window as any).__catalog = {
  components: registry.map((c) => ({ name: c.name, group: c.group, demos: c.demos.map((d) => d.title) })),
  show(component: string, theme: "light" | "dark" = "light", demo: number | null = null) {
    applyState({ component, theme, chrome: false, demo });
  },
};
