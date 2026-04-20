import {
  $,
  _,
  forget,
  remember,
  replace,
  transaction,
  when,
  whenever,
} from "@jam/core";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_WORKSPACE_NAME = "Default";

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: number;
}

let nextWorkspaceSuffix = 1;

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

function cleanWorkspaceName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 48);
}

function workspaceExists(workspaceId: string): boolean {
  return when(["workspace", workspaceId, "name", $.name]).length > 0;
}

export function ensureDefaultWorkspace(): void {
  if (workspaceExists(DEFAULT_WORKSPACE_ID)) return;

  remember("workspace", DEFAULT_WORKSPACE_ID, "name", DEFAULT_WORKSPACE_NAME);
  remember("workspace", DEFAULT_WORKSPACE_ID, "createdAt", 0);
}

export function getWorkspaces(): WorkspaceSummary[] {
  const workspaces = when(
    ["workspace", $.workspaceId, "name", $.name],
    ["workspace", $.workspaceId, "createdAt", $.createdAt],
  ).map(({ workspaceId, name, createdAt }) => ({
    id: workspaceId as string,
    name: name as string,
    createdAt: Number(createdAt),
  }));

  if (workspaces.length > 0) {
    return workspaces.sort((a, b) => a.createdAt - b.createdAt);
  }

  return [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: 0,
    },
  ];
}

export function getActiveWorkspaceId(): string {
  const selected = last(when(["ui", "selectedWorkspace", $.workspaceId]));
  const workspaceId = selected?.workspaceId as string | undefined;

  if (workspaceId && workspaceExists(workspaceId)) return workspaceId;
  return DEFAULT_WORKSPACE_ID;
}

export function getSessionWorkspaceId(sessionId: string): string | undefined {
  return last(when(["session", sessionId, "workspace", $.workspaceId]))
    ?.workspaceId as string | undefined;
}

export function getTerminalWorkspaceId(terminalId: string): string | undefined {
  return last(when(["terminal", terminalId, "workspace", $.workspaceId]))
    ?.workspaceId as string | undefined;
}

function sessionBelongsToWorkspace(sessionId: string, workspaceId: string) {
  return getSessionWorkspaceId(sessionId) === workspaceId;
}

function getWorkspaceSelectedSession(workspaceId: string): string {
  const selected = last(
    when(["workspace", workspaceId, "selectedSession", $.sessionId]),
  )?.sessionId as string | undefined;

  if (selected && sessionBelongsToWorkspace(selected, workspaceId)) {
    return selected;
  }

  return "";
}

export function getSelectedSessionForActiveWorkspace(): string {
  return getWorkspaceSelectedSession(getActiveWorkspaceId());
}

export function selectSessionInWorkspace(
  workspaceId: string,
  sessionId: string,
): void {
  transaction(() => {
    replace("workspace", workspaceId, "selectedSession", sessionId);
    replace("ui", "selectedSession", sessionId);
  });
}

export function setActiveWorkspace(workspaceId: string): void {
  ensureDefaultWorkspace();
  if (!workspaceExists(workspaceId)) return;

  const selectedSession = getWorkspaceSelectedSession(workspaceId);
  transaction(() => {
    replace("ui", "selectedWorkspace", workspaceId);
    replace("ui", "selectedSession", selectedSession);
    forget("ui", "selectedTerminal", _);
  });
}

export function createWorkspace(name?: string): string {
  ensureDefaultWorkspace();

  const workspaces = getWorkspaces();
  const workspaceId = `workspace-${Date.now()}-${nextWorkspaceSuffix++}`;
  const label = cleanWorkspaceName(name ?? "") || `Workspace ${workspaces.length + 1}`;

  transaction(() => {
    remember("workspace", workspaceId, "name", label);
    remember("workspace", workspaceId, "createdAt", Date.now());
  });
  setActiveWorkspace(workspaceId);

  return workspaceId;
}

export function ensureSessionWorkspace(
  sessionId: string,
  workspaceId = getActiveWorkspaceId(),
): string {
  ensureDefaultWorkspace();
  const existing = getSessionWorkspaceId(sessionId);
  if (existing) return existing;

  remember("session", sessionId, "workspace", workspaceId);
  return workspaceId;
}

function ensureTerminalWorkspace(terminalId: string, sessionId: string): void {
  const existing = getTerminalWorkspaceId(terminalId);
  if (existing) return;

  const workspaceId = getSessionWorkspaceId(sessionId) ?? DEFAULT_WORKSPACE_ID;
  remember("terminal", terminalId, "workspace", workspaceId);
}

function restoreSelectedWorkspace(): void {
  ensureDefaultWorkspace();

  const activeWorkspaceId = getActiveWorkspaceId();
  const selectedSession = getWorkspaceSelectedSession(activeWorkspaceId);
  transaction(() => {
    replace("ui", "selectedWorkspace", activeWorkspaceId);
    replace("ui", "selectedSession", selectedSession);
  });
}

function migrateExistingFacts(): void {
  ensureDefaultWorkspace();

  const selectedSession = last(when(["ui", "selectedSession", $.sessionId]))
    ?.sessionId as string | undefined;
  const activeWorkspaceId = getActiveWorkspaceId();

  for (const { sid } of when(["session", $.sid, "agent", $.agent])) {
    ensureSessionWorkspace(sid as string, activeWorkspaceId);
  }

  for (const { tid, sid } of when(["terminal", $.tid, "session", $.sid])) {
    ensureTerminalWorkspace(tid as string, sid as string);
  }

  if (selectedSession && sessionBelongsToWorkspace(selectedSession, activeWorkspaceId)) {
    replace("workspace", activeWorkspaceId, "selectedSession", selectedSession);
  }

  restoreSelectedWorkspace();
}

export function startWorkspaceSupport(): () => void {
  migrateExistingFacts();

  const disposers = [
    whenever([["session", $.sid, "agent", $.agent]], (sessions) => {
      for (const { sid } of sessions) {
        ensureSessionWorkspace(sid as string);
      }
    }),
    whenever([["terminal", $.tid, "session", $.sid]], (terminals) => {
      for (const { tid, sid } of terminals) {
        ensureTerminalWorkspace(tid as string, sid as string);
      }
    }),
    whenever([["ui", "selectedWorkspace", $.workspaceId]], () => {
      restoreSelectedWorkspace();
    }),
  ];

  return () => {
    for (const dispose of disposers) dispose();
  };
}

export function startWorkspaceKeyboardShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || event.metaKey || event.ctrlKey) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName.toLowerCase();
    if (
      tagName === "input" ||
      tagName === "textarea" ||
      target?.isContentEditable
    ) {
      return;
    }

    const workspaces = getWorkspaces();
    const activeId = getActiveWorkspaceId();
    const activeIndex = Math.max(
      0,
      workspaces.findIndex((workspace) => workspace.id === activeId),
    );

    if (/^[1-9]$/.test(event.key)) {
      const nextWorkspace = workspaces[Number(event.key) - 1];
      if (!nextWorkspace) return;
      event.preventDefault();
      setActiveWorkspace(nextWorkspace.id);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (activeIndex + direction + workspaces.length) % workspaces.length;
      setActiveWorkspace(workspaces[nextIndex].id);
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      createWorkspace();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
