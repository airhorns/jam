import { db, mount } from "@jam/core";
import { h } from "@jam/core/jsx";
import { createJamUI } from "@jam/ui";
import { JamUICatalog } from "./app";
import "./styles.css";

createJamUI({
  tokens: {
    size: { "1": 8, "2": 16, "3": 24, "4": 32, "5": 44, "6": 56 },
    space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 24, "6": 32, "7": 48 },
    radius: { "1": 3, "2": 5, "3": 8, "4": 12, "5": 16 },
    color: {
      ink: "#172026",
      paper: "#f7f4ef",
      cloud: "#edf2f7",
      line: "#d5d9d4",
      lineHover: "#8d9b95",
      teal: "#007f73",
      blue: "#2f6fcb",
      amber: "#b45f06",
      rose: "#b8325d",
      midnight: "#111827",
      frost: "#f8fafc",
    },
    zIndex: { "1": 1, "2": 10, "3": 100 },
  },
  themes: {
    light: {
      background: "#f7f4ef",
      backgroundHover: "#ece7de",
      backgroundPress: "#e2dace",
      backgroundFocus: "#2f6fcb",
      borderColor: "#d5d9d4",
      borderColorHover: "#8d9b95",
      color: "#172026",
      outlineColor: "#2f6fcb",
    },
    dark: {
      background: "#111827",
      backgroundHover: "#1f2937",
      backgroundPress: "#374151",
      backgroundFocus: "#009688",
      borderColor: "#374151",
      borderColorHover: "#6b7280",
      color: "#f8fafc",
      outlineColor: "#009688",
    },
  },
  defaultTheme: "light",
});

mount(<JamUICatalog />, document.getElementById("app")!);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
