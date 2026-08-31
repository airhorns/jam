// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, listPrograms, mount, removeProgram, replace } from "@jam/core";
import { h } from "@jam/core/jsx";
import { setupDefaultUI } from "@jam/ui/testing";
import { MetaAgentPanel, createMemoryJamFileSystem, createMetaAgent } from "..";
import type { MetaAgent } from "../types";

let dispose: (() => void) | undefined;

function show(agent: MetaAgent, props: Partial<{ title: string; width: number }> = {}, attach = true) {
  const root = document.createElement("div");
  if (attach) document.body.appendChild(root);
  dispose = mount(<MetaAgentPanel agent={agent} {...props} />, root);
  return root;
}

const fakeAgent = (id: string): MetaAgent & { runPrompt: ReturnType<typeof vi.fn> } => ({
  id,
  fs: createMemoryJamFileSystem(),
  tools: [],
  addTool() {},
  runPrompt: vi.fn(async () => {}),
});

const input = (root: ParentNode) => root.querySelector<HTMLInputElement>("[data-testid=meta-agent-input]")!;
const keydown = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

describe("MetaAgentPanel", () => {
  beforeEach(() => {
    for (const id of listPrograms()) removeProgram(id);
    db.clear();
    setupDefaultUI();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("shows the empty state with the default title", () => {
    const agent = createMetaAgent({ id: "panel", fs: createMemoryJamFileSystem() });
    const root = show(agent);
    const panel = root.querySelector("[data-testid=meta-agent-panel]")!;
    expect(panel.textContent).toContain("Meta Agent");
    expect(panel.textContent).toContain("idle");
    expect(panel.textContent).toContain("No browser files yet");
    expect(panel.textContent).toContain("No transcript yet");
    expect(input(root).id).toBe("panel-prompt");
    expect(root.querySelector<HTMLButtonElement>("[data-testid=meta-agent-send]")!.disabled).toBe(false);
  });

  it("lists program files and the transcript as they appear", async () => {
    const agent = createMetaAgent({ id: "panel", fs: createMemoryJamFileSystem() });
    const root = show(agent, { title: "Helper", width: 200 });
    agent.fs.writeFile("/programs/a.js", "12345");
    await agent.runPrompt("write a program using the ui");

    const panel = root.querySelector("[data-testid=meta-agent-panel]")!;
    expect(panel.textContent).toContain("Helper");
    expect(panel.textContent).toContain("/programs/a.js");
    expect(panel.textContent).toContain("5b");
    const transcript = root.querySelector("[data-testid=meta-agent-transcript]")!;
    const roles = Array.from(transcript.children, (entry) => entry.firstElementChild!.textContent);
    expect(roles[0]).toBe("user");
    expect(roles.at(-1)).toBe("assistant");
    expect(roles).toContain("tool");
    expect(transcript.textContent).toContain("write a program using the ui");
    expect(transcript.textContent).not.toContain("No transcript yet");
  });

  it("submits the trimmed prompt on Enter or Run and clears the input", () => {
    const agent = fakeAgent("fake");
    const root = show(agent);
    const field = input(root);

    keydown(field, "Enter");
    field.value = "   ";
    keydown(field, "Enter");
    expect(agent.runPrompt).not.toHaveBeenCalled();

    field.value = "  hello  ";
    keydown(field, "a");
    expect(agent.runPrompt).not.toHaveBeenCalled();
    keydown(field, "Enter");
    expect(agent.runPrompt).toHaveBeenCalledWith("hello");
    expect(field.value).toBe("");

    field.value = "again";
    root.querySelector<HTMLButtonElement>("[data-testid=meta-agent-send]")!.click();
    expect(agent.runPrompt).toHaveBeenLastCalledWith("again");
  });

  it("does nothing when its input is not in the document", () => {
    const agent = fakeAgent("detached");
    const root = show(agent, {}, false);
    root.querySelector<HTMLButtonElement>("[data-testid=meta-agent-send]")!.click();
    expect(agent.runPrompt).not.toHaveBeenCalled();
  });

  it("disables Run while running and highlights a failure", () => {
    const agent = fakeAgent("status");
    const root = show(agent);
    const send = () => root.querySelector<HTMLButtonElement>("[data-testid=meta-agent-send]")!;
    const statusText = () => root.querySelector("[data-testid=meta-agent-panel]")!.textContent;

    replace("metaAgent", "status", "status", "running");
    expect(send().disabled).toBe(true);
    expect(statusText()).toContain("running");

    replace("metaAgent", "status", "status", "failed");
    expect(send().disabled).toBe(false);
    expect(statusText()).toContain("failed");
  });
});
