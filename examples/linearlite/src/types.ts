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

export interface Issue {
  id: string;
  title: string;
  description: string;
  priority: PriorityValue;
  status: StatusValue;
  modified: string;
  created: string;
  kanbanorder: string;
  username: string;
  synced: boolean;
}

export interface Comment {
  id: string;
  body: string;
  username: string;
  issue_id: string;
  created: string;
  synced: boolean;
}

export const USERNAME = "you";

/** Columns owned by the sync machinery; never written back from facts. */
export const LOCAL_STATE_COLUMNS = ["synced", "modified_columns", "sent_to_server", "backup", "new", "deleted"];
