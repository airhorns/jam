import { h } from "@jam/core/jsx";
import type { PriorityValue, StatusValue } from "../types";

// The icons stay hand-written SVG. They inherit `currentColor`, and the colours
// below are theme CSS variables (`@jam/ui` renders every theme as `--<key>`),
// so they follow a light/dark switch without re-rendering.
const STATUS_COLOR: Record<string, string> = {
  backlog: "var(--color10)",
  todo: "var(--color10)",
  in_progress: "var(--yellow10)",
  done: "var(--blue10)",
  canceled: "var(--color9)",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "var(--orange10)",
};

interface SvgProps {
  color?: string;
  children?: unknown;
}

function Svg({ color, children, ...rest }: SvgProps & Record<string, unknown>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      style={`flex: none; color: ${color ?? "inherit"}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function StatusIcon({ status }: { status?: StatusValue | string }) {
  const marks = { "data-testid": "status-icon", "data-status": status ?? "unknown", color: STATUS_COLOR[String(status)] ?? "var(--color10)" };
  switch (status) {
    case "todo":
      return (
        <Svg {...marks}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
        </Svg>
      );
    case "in_progress":
      return (
        <Svg {...marks}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
        </Svg>
      );
    case "done":
      return (
        <Svg {...marks}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="var(--background)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </Svg>
      );
    case "canceled":
      return (
        <Svg {...marks}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" fill="none" stroke="var(--background)" stroke-width="1.6" stroke-linecap="round" />
        </Svg>
      );
    default:
      return (
        <Svg {...marks}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2" />
        </Svg>
      );
  }
}

export function PriorityIcon({ priority }: { priority?: PriorityValue | string }) {
  const marks = {
    "data-testid": "priority-icon",
    "data-priority": priority ?? "none",
    color: PRIORITY_COLOR[String(priority)] ?? "var(--color10)",
  };
  const bars = priority === "low" ? 1 : priority === "medium" ? 2 : priority === "high" ? 3 : 0;
  if (priority === "urgent") {
    return (
      <Svg {...marks}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4v5" stroke="var(--background)" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="8" cy="11.6" r="1" fill="var(--background)" />
      </Svg>
    );
  }
  if (bars === 0) {
    return (
      <Svg {...marks}>
        <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
      </Svg>
    );
  }
  return (
    <Svg {...marks}>
      <rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" opacity={bars >= 1 ? "1" : "0.3"} />
      <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity={bars >= 2 ? "1" : "0.3"} />
      <rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" opacity={bars >= 3 ? "1" : "0.3"} />
    </Svg>
  );
}

export function ListIcon() {
  return (
    <Svg>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </Svg>
  );
}

export function BoardIcon() {
  return (
    <Svg>
      <rect x="2" y="2.5" width="3.5" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
      <rect x="6.25" y="2.5" width="3.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
      <rect x="10.5" y="2.5" width="3.5" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
    </Svg>
  );
}

export function SearchIcon() {
  return (
    <Svg>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </Svg>
  );
}

export function PlusIcon() {
  return (
    <Svg>
      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </Svg>
  );
}

export function CloseIcon() {
  return (
    <Svg>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </Svg>
  );
}

export function FilterIcon() {
  return (
    <Svg>
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </Svg>
  );
}

export function SortIcon() {
  return (
    <Svg>
      <path d="M5 3v10M5 13l-2.5-2.5M5 13l2.5-2.5M11 13V3M11 3l-2.5 2.5M11 3l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    </Svg>
  );
}

export function BackIcon() {
  return (
    <Svg>
      <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </Svg>
  );
}

export function ChevronIcon() {
  return (
    <Svg>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </Svg>
  );
}
