// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, injectedRules } from "../../testing";
import { Dialog } from "../Dialog";
import { AlertDialog } from "../AlertDialog";
import { Button } from "../Button";
import { renderError } from "./helpers";

beforeEach(() => {
  setupDefaultUI();
});

function Example(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; modal?: boolean }) {
  return h(
    Dialog,
    props,
    h(Dialog.Trigger, { "data-testid": "trigger" }, "Open"),
    h(
      Dialog.Portal,
      null,
      h(Dialog.Overlay, { "data-testid": "overlay" }),
      h(
        Dialog.Content,
        { "data-testid": "content" },
        h(Dialog.Title, null, "Title"),
        h(Dialog.Description, null, "Description"),
        h("input", { "data-testid": "field" }),
        h(Dialog.Close, { "data-testid": "close" }, "Close"),
      ),
    ),
  );
}

describe("Dialog", () => {
  it("renders nothing in the portal until opened", () => {
    const { get, query } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.dataset.state).toBe("closed");
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("opens from the trigger and wires up aria", () => {
    const { get } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    const content = get("[data-testid=content]");
    expect(content.getAttribute("role")).toBe("dialog");
    expect(content.getAttribute("aria-modal")).toBe("true");
    expect(content.getAttribute("tabindex")).toBe("-1");
    expect(content.dataset.state).toBe("open");
    expect(get("[data-testid=trigger]").getAttribute("aria-expanded")).toBe("true");
    expect(get("[data-testid=trigger]").getAttribute("aria-controls")).toBe(content.id);
    const title = get("#" + content.getAttribute("aria-labelledby"));
    expect(title.tagName).toBe("H2");
    expect(title.textContent).toBe("Title");
    const description = get("#" + content.getAttribute("aria-describedby"));
    expect(description.tagName).toBe("P");
  });

  it("renders in a portal centred over a fixed overlay", () => {
    const { get, container } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    const content = get("[data-testid=content]");
    expect(content.closest("[data-testid=trigger]")).toBeNull();
    expect(container.lastElementChild!.contains(content)).toBe(true);
    const portal = content.parentElement!;
    expect(css(portal)).toMatchObject({ position: "fixed", top: "0px", left: "0px", "align-items": "center", "justify-content": "center", "pointer-events": "none" });
    expect(css(get("[data-testid=overlay]"))).toMatchObject({ position: "fixed", "background-color": "var(--shadow6)", "pointer-events": "auto" });
    expect(css(content)).toMatchObject({
      "background-color": "var(--background)",
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      padding: "18px",
      "border-radius": "9px",
      "pointer-events": "auto",
      "max-width": "min(90vw, 560px)",
    });
    expect(css(content)["box-shadow"]).toContain("var(--shadowColor)");
  });

  it("plays an enter animation from enterStyle", () => {
    const { get } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    const content = get("[data-testid=content]");
    const animation = css(content).animation;
    expect(animation).toMatch(/^enter_\S+ 150ms/);
    const name = animation.split(" ")[0];
    expect(injectedRules().some((rule) => rule.startsWith(`@keyframes ${name}`) && rule.includes("opacity: 0"))).toBe(true);
  });

  it("closes from Close, Escape and the overlay", () => {
    const { get, query } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    click(get("[data-testid=close]"));
    expect(query("[data-testid=content]")).toBeNull();

    click(get("[data-testid=trigger]"));
    keydown(document.body, "Escape");
    expect(query("[data-testid=content]")).toBeNull();

    click(get("[data-testid=trigger]"));
    click(get("[data-testid=overlay]"));
    expect(query("[data-testid=content]")).toBeNull();
    expect(get("[data-testid=trigger]").getAttribute("aria-expanded")).toBe("false");
  });

  it("moves focus into the content, locks scroll and restores focus on close", async () => {
    const { get } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    trigger.focus();
    click(trigger);
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=field]"));
    expect(document.body.style.overflow).toBe("hidden");
    keydown(document.body, "Escape");
    await tick();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("releases the scroll lock when the tree unmounts while open", async () => {
    const { get, unmount } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    await tick();
    expect(document.body.style.overflow).toBe("");
  });

  it("supports controlled open state", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { open: false, onOpenChange }));
    click(get("[data-testid=trigger]"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(query("[data-testid=content]")).toBeNull();

    const opened = render(h(Example, { open: true, onOpenChange }));
    expect(opened.query("[data-testid=content]")).not.toBeNull();
    keydown(document.body, "Escape");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(opened.query("[data-testid=content]")).not.toBeNull();
  });

  it("starts open with defaultOpen", () => {
    const { query } = render(h(Example, { defaultOpen: true }));
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("non-modal dialogs skip aria-modal and the scroll lock", () => {
    const { get } = render(h(Example, { modal: false }));
    click(get("[data-testid=trigger]"));
    expect(get("[data-testid=content]").hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("merges trigger and close behaviour onto children with asChild", () => {
    const onClick = vi.fn();
    const { get, query } = render(
      h(
        Dialog,
        null,
        h(Dialog.Trigger, { asChild: true }, h(Button, { "data-testid": "custom", size: "$2", onClick }, "Open")),
        h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "content" }, h(Dialog.Close, { asChild: true }, h("a", { href: "#", "data-testid": "link" }, "Done")))),
      ),
    );
    const custom = get("[data-testid=custom]");
    expect(custom.classList.contains("is_Button")).toBe(true);
    expect(custom.getAttribute("aria-haspopup")).toBe("dialog");
    expect(css(custom).height).toBe("28px");
    click(custom);
    expect(onClick).toHaveBeenCalled();
    expect(query("[data-testid=content]")).not.toBeNull();
    click(get("[data-testid=link]"));
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("runs a caller onClick on the trigger before opening", () => {
    const onClick = vi.fn();
    const { get, query } = render(h(Dialog, null, h(Dialog.Trigger, { "data-testid": "trigger", onClick }, "Open"), h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "content" }, h(Dialog.Title, null, "T")))));
    click(get("[data-testid=trigger]"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("finds a Title nested deeper in the content for aria-labelledby", () => {
    const { get } = render(
      h(
        Dialog,
        { defaultOpen: true },
        h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "content" }, h("header", null, h("div", null, h(Dialog.Title, null, "Nested"))), h("p", null, "Body"))),
      ),
    );
    const content = get("[data-testid=content]");
    expect(get("#" + content.getAttribute("aria-labelledby")).textContent).toBe("Nested");
    expect(content.hasAttribute("aria-describedby")).toBe(false);
  });

  it("reports parts rendered outside a Dialog", () => {
    expect(renderError(h(Dialog.Trigger, null, "Lost"))).toMatch(/Dialog.Trigger must be rendered inside <Dialog>/);
  });
});

describe("AlertDialog", () => {
  function Alert(props: { onConfirm?: () => void }) {
    return h(
      AlertDialog,
      null,
      h(AlertDialog.Trigger, { "data-testid": "trigger" }, "Delete"),
      h(
        AlertDialog.Portal,
        null,
        h(AlertDialog.Overlay, { "data-testid": "overlay" }),
        h(
          AlertDialog.Content,
          { "data-testid": "content" },
          h(AlertDialog.Title, null, "Delete?"),
          h(AlertDialog.Description, null, "Irreversible."),
          h(AlertDialog.Cancel, { "data-testid": "cancel" }, "Cancel"),
          h(AlertDialog.Action, { "data-testid": "action", onClick: props.onConfirm }, "Delete"),
        ),
      ),
    );
  }

  it("uses the alertdialog role and ignores outside presses", () => {
    const { get, query } = render(h(Alert, {}));
    click(get("[data-testid=trigger]"));
    expect(get("[data-testid=content]").getAttribute("role")).toBe("alertdialog");
    click(get("[data-testid=overlay]"));
    expect(query("[data-testid=content]")).not.toBeNull();
    keydown(document.body, "Escape");
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("closes through Cancel and Action", () => {
    const onConfirm = vi.fn();
    const { get, query } = render(h(Alert, { onConfirm }));
    click(get("[data-testid=trigger]"));
    click(get("[data-testid=cancel]"));
    expect(query("[data-testid=content]")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    click(get("[data-testid=trigger]"));
    const action = get("[data-testid=action]");
    expect(action.className).toContain("t_light_accent");
    click(action);
    expect(onConfirm).toHaveBeenCalled();
    expect(query("[data-testid=content]")).toBeNull();
  });
});
