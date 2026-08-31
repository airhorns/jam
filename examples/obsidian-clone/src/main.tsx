import { h } from "@jam/core/jsx";
import { db, mount } from "@jam/core";
import { createJamUI, defaultConfig } from "@jam/ui";
import { ObsidianCloneApp } from "./app";

createJamUI({ ...defaultConfig, defaultTheme: "dark" });
mount(<ObsidianCloneApp />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
