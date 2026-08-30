export const Status = {
  BACKLOG: "backlog",
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  CANCELED: "canceled",
} as const;

export type StatusValue = (typeof Status)[keyof typeof Status];

export const StatusValues: StatusValue[] = [
  Status.BACKLOG,
  Status.TODO,
  Status.IN_PROGRESS,
  Status.DONE,
  Status.CANCELED,
];

export const StatusDisplay: Record<StatusValue, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};

export const Priority = {
  NONE: "none",
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type PriorityValue = (typeof Priority)[keyof typeof Priority];

export const PriorityValues: PriorityValue[] = [
  Priority.NONE,
  Priority.URGENT,
  Priority.HIGH,
  Priority.MEDIUM,
  Priority.LOW,
];

export const PriorityDisplay: Record<PriorityValue, string> = {
  none: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface Project {
  id: string;
  name: string;
  key: string;
  created: string;
}

export interface Issue {
  id: string;
  project: string;
  title: string;
  description: string;
  priority: PriorityValue;
  status: StatusValue;
  modified: string;
  created: string;
  kanbanorder: string;
  username: string;
}

export interface Comment {
  id: string;
  issue: string;
  body: string;
  username: string;
  created: string;
  modified: string;
}

export const USERNAME = "you";

/** The sync partition an issue's and its comments' facts live in; project facts themselves are global. */
export const projectScope = (projectId: string): string => `project:${projectId}`;

/** Facts that never leave the browser: navigation, UI state, derived query windows and the recent list. */
export const EPHEMERAL = new Set(["route", "ui", "query", "stats", "recent"]);

export const isEphemeral = (fact: readonly unknown[]): boolean => EPHEMERAL.has(fact[0] as string);
