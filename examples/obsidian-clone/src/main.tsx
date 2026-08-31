import { h } from "@jam/core/jsx";
import { $, _, db, describeUI, drive, mount, outlineUI, press } from "@jam/core";
import { createJamUI, defaultConfig } from "@jam/ui";
import { ObsidianCloneApp } from "./app";

createJamUI({ ...defaultConfig, defaultTheme: "dark" });
mount(<ObsidianCloneApp />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  Object.assign(window, { __jam: { $, _, describeUI, outlineUI, drive, press }, __db: db });
}
