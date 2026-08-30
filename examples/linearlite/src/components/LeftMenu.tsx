import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { $, when } from "@jam/core";
import { readValue } from "../facts";
import type { Route } from "../programs/router";
import { openModal } from "../programs/ui";
import { BoardIcon, ListIcon, PlusIcon, SearchIcon } from "./icons";
import { link } from "./links";
import { NEW_ISSUE_MODAL } from "./NewIssueModal";

interface NavItem {
  href: string;
  label: string;
  icon: () => VChild;
  matches: (route: Route) => boolean;
}

const statusesOf = (route: Route) => [...route.filter.status].sort().join(",");

const NAV: NavItem[] = [
  { href: "/", label: "All issues", icon: ListIcon, matches: (r) => r.page === "list" && statusesOf(r) === "" },
  {
    href: "/?status=todo,in_progress",
    label: "Active",
    icon: ListIcon,
    matches: (r) => r.page === "list" && statusesOf(r) === "in_progress,todo",
  },
  { href: "/?status=backlog", label: "Backlog", icon: ListIcon, matches: (r) => r.page === "list" && statusesOf(r) === "backlog" },
  { href: "/board", label: "Board", icon: BoardIcon, matches: (r) => r.page === "board" },
  { href: "/search", label: "Search", icon: SearchIcon, matches: (r) => r.page === "search" },
];

function RecentIssues({ route }: { route: Route }) {
  const recent = when(["recent", $.id, "viewedAt", $.at]).sort((a, b) => Number(b.at) - Number(a.at));
  if (recent.length === 0) return null;
  return (
    <div class="left-menu-section">
      <div class="left-menu-heading">Recent</div>
      {recent.map(({ id }) => {
        const issueId = String(id);
        const title = readValue("issue", issueId, "title") ?? readValue("recent", issueId, "title") ?? "Untitled";
        const href = `/issue/${issueId}`;
        return (
          <a key={issueId} class={route.issueId === issueId ? "nav-link recent active" : "nav-link recent"} href={href} onClick={link(href)}>
            {String(title)}
          </a>
        );
      })}
    </div>
  );
}

function SyncBadge() {
  const status = when(["sync", "status", $.status])[0]?.status;
  const message = when(["sync", "message", $.message])[0]?.message;
  if (status === "standalone") return <div class="sync-badge standalone">Local database · no sync configured</div>;
  if (status === "done") return <div class="sync-badge synced">Syncing with Electric</div>;
  if (status === "initial-sync") return <div class="sync-badge syncing">{String(message || "Syncing…")}</div>;
  return null;
}

export function LeftMenu({ route }: { route: Route }) {
  return (
    <nav class="left-menu">
      <div class="left-menu-brand">
        <span class="brand-mark">jam</span>
        <span class="brand-name">LinearLite</span>
      </div>
      <button type="button" class="button primary new-issue-button" onClick={() => openModal(NEW_ISSUE_MODAL)}>
        <PlusIcon />
        New issue
      </button>
      <div class="left-menu-section">
        <div class="left-menu-heading">Issues</div>
        {NAV.map((item) => (
          <a key={item.href} class={item.matches(route) ? "nav-link active" : "nav-link"} href={item.href} onClick={link(item.href)}>
            {item.icon()}
            {item.label}
          </a>
        ))}
      </div>
      <RecentIssues route={route} />
      <div class="left-menu-footer">
        <SyncBadge />
      </div>
    </nav>
  );
}
