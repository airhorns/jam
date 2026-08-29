import type { VChild } from "@jam/core/jsx";

export type Demo = {
  title: string;
  description?: string;
  render: () => VChild;
};

export type DemoGroup =
  | "Layout"
  | "Typography"
  | "Forms"
  | "Overlays"
  | "Content"
  | "Feedback"
  | "Navigation"
  | "Utilities";

export type ComponentDemos = {
  name: string;
  group: DemoGroup;
  description?: string;
  demos: Demo[];
};
