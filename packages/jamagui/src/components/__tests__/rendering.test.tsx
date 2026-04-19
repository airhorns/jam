// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, mount, replace, when, $ } from "@jam/core";
import { h } from "@jam/core/jsx";
import {
  Button,
  Checkbox,
  Input,
  Progress,
  Text,
  XStack,
  YStack,
  clearInjectedStyles,
  createJamUI,
} from "../..";

let dispose: (() => void) | undefined;

function configureTestUI() {
  createJamUI({
    tokens: {
      size: { "1": 8, "2": 16, "3": 24, "4": 32, "5": 44 },
      space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 24 },
      radius: { "1": 4, "2": 6, "3": 8, "4": 10 },
      color: {
        ink: "#172026",
        paper: "#f7f4ef",
        line: "#d5d9d4",
        lineHover: "#9aa7a0",
        blue: "#2f6fcb",
      },
      zIndex: { "1": 1 },
    },
    themes: {
      test: {
        background: "#f7f4ef",
        backgroundHover: "#ece7de",
        backgroundPress: "#e2dace",
        backgroundFocus: "#2f6fcb",
        borderColor: "#d5d9d4",
        borderColorHover: "#9aa7a0",
        color: "#172026",
        outlineColor: "#2f6fcb",
      },
    },
    defaultTheme: "test",
  });
}

beforeEach(() => {
  db.clear();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  clearInjectedStyles();
  configureTestUI();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe("Jam UI DOM rendering", () => {
  it("mounts themed components through Jam's renderer", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    function RenderSpec() {
      return (
        <YStack id="review-panel" gap={12} padding="$space.4">
          <Text id="headline" fontSize={18} fontWeight={700}>
            Component review
          </Text>
          <XStack gap={8} alignItems="center">
            <Button id="save-button">
              <Text>Save changes</Text>
            </Button>
            <Input id="email-input" placeholder="review@example.com" />
          </XStack>
          <Progress id="progress" value={65}>
            <Progress.Indicator width="65%" />
          </Progress>
        </YStack>
      );
    }

    dispose = mount(<RenderSpec />, container);

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save changes")
    );

    expect(container.querySelector("#review-panel")).toBeInstanceOf(HTMLElement);
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector("#email-input")?.getAttribute("placeholder")).toBe(
      "review@example.com",
    );
    expect(container.textContent).toContain("Component review");
    expect(document.getElementById("jamagui-themes")?.textContent).toContain(
      "--background: #f7f4ef",
    );
    const styleElement = document.getElementById("jamagui-styles") as HTMLStyleElement | null;
    expect(styleElement?.sheet?.cssRules.length).toBeGreaterThan(0);
  });

  it("keeps interactive component state in the fact database", () => {
    replace("review", "accepted", false);
    const container = document.createElement("div");
    document.body.appendChild(container);

    function InteractiveSpec() {
      const accepted = Boolean(when(["review", "accepted", $.value])[0]?.value);

      return (
        <Checkbox
          id="acceptance-toggle"
          checked={accepted}
          onCheckedChange={(value) => replace("review", "accepted", value)}
        >
          <Checkbox.Indicator>
            <Text>yes</Text>
          </Checkbox.Indicator>
        </Checkbox>
      );
    }

    dispose = mount(<InteractiveSpec />, container);

    const checkbox = container.querySelector("#acceptance-toggle") as HTMLElement;
    expect(checkbox.getAttribute("aria-checked")).toBe("false");

    checkbox.click();

    expect(when(["review", "accepted", $.value])[0]?.value).toBe(true);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("yes");
  });
});
