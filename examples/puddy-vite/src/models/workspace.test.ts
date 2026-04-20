import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, $, remember, replace, when } from "@jam/core";
import {
  DEFAULT_WORKSPACE_ID,
  createWorkspace,
  ensureSessionWorkspace,
  getActiveWorkspaceId,
  getSelectedSessionForActiveWorkspace,
  selectSessionInWorkspace,
  setActiveWorkspace,
  startWorkspaceSupport,
} from "./workspace";

let disposeWorkspaceSupport: (() => void) | undefined;

beforeEach(() => {
  db.clear();
});

afterEach(() => {
  disposeWorkspaceSupport?.();
  disposeWorkspaceSupport = undefined;
  db.clear();
});

describe("workspace model", () => {
  it("creates a default workspace and active workspace selection", () => {
    disposeWorkspaceSupport = startWorkspaceSupport();

    expect(when(["workspace", DEFAULT_WORKSPACE_ID, "name", "Default"])).toHaveLength(1);
    expect(getActiveWorkspaceId()).toBe(DEFAULT_WORKSPACE_ID);
    expect(when(["ui", "selectedWorkspace", DEFAULT_WORKSPACE_ID])).toHaveLength(1);
  });

  it("assigns unscoped sessions to the active workspace", () => {
    disposeWorkspaceSupport = startWorkspaceSupport();

    remember("session", "s-1", "agent", "claude");
    replace("session", "s-1", "status", "active");

    expect(
      when(["session", "s-1", "workspace", DEFAULT_WORKSPACE_ID]),
    ).toHaveLength(1);
  });

  it("preserves the selected session per workspace", () => {
    disposeWorkspaceSupport = startWorkspaceSupport();
    const otherWorkspace = createWorkspace("Project B");

    remember("session", "s-default", "agent", "claude");
    remember("session", "s-default", "workspace", DEFAULT_WORKSPACE_ID);
    replace("session", "s-default", "status", "active");
    remember("session", "s-other", "agent", "codex");
    remember("session", "s-other", "workspace", otherWorkspace);
    replace("session", "s-other", "status", "active");

    selectSessionInWorkspace(otherWorkspace, "s-other");
    setActiveWorkspace(DEFAULT_WORKSPACE_ID);
    selectSessionInWorkspace(DEFAULT_WORKSPACE_ID, "s-default");

    expect(getSelectedSessionForActiveWorkspace()).toBe("s-default");

    setActiveWorkspace(otherWorkspace);

    expect(getSelectedSessionForActiveWorkspace()).toBe("s-other");
    expect(when(["ui", "selectedSession", $.sid])).toContainEqual({
      sid: "s-other",
    });
  });

  it("keeps terminal facts in their session workspace", () => {
    disposeWorkspaceSupport = startWorkspaceSupport();
    const otherWorkspace = createWorkspace("Project B");

    remember("session", "s-other", "agent", "codex");
    remember("session", "s-other", "workspace", otherWorkspace);
    replace("session", "s-other", "status", "active");
    remember("terminal", "term-1", "session", "s-other");

    expect(when(["terminal", "term-1", "workspace", otherWorkspace])).toHaveLength(1);
  });

  it("can explicitly attach a session to the active workspace", () => {
    const workspaceId = createWorkspace("Scratch");
    setActiveWorkspace(workspaceId);

    expect(ensureSessionWorkspace("s-new")).toBe(workspaceId);
    expect(when(["session", "s-new", "workspace", workspaceId])).toHaveLength(1);
  });
});
