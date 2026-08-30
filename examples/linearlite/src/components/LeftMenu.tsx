import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { $, when } from "@jam/core";
import { readValue } from "../facts";
import { createProject } from "../mutations";
import { listProjects, projectPath } from "../projects";
import { navigate, type Route } from "../programs/router";
import { openModal } from "../programs/ui";
import { BoardIcon, ChevronIcon, ListIcon, PlusIcon, SearchIcon } from "./icons";
import { link } from "./links";
import { Menu, MenuHeading, MenuItem } from "./Menu";
import { NEW_ISSUE_MODAL } from "./NewIssueModal";

interface NavItem {
  path: string;
  label: string;
  icon: () => VChild;
  matches: (route: Route) => boolean;
}

const statusesOf = (route: Route) => [...route.filter.status].sort().join(",");

const NAV: NavItem[] = [
  { path: "", label: "All issues", icon: ListIcon, matches: (r) => r.page === "list" && statusesOf(r) === "" },
  {
    path: "?status=todo,in_progress",
    label: "Active",
    icon: ListIcon,
    matches: (r) => r.page === "list" && statusesOf(r) === "in_progress,todo",
  },
  { path: "?status=backlog", label: "Backlog", icon: ListIcon, matches: (r) => r.page === "list" && statusesOf(r) === "backlog" },
  { path: "/board", label: "Board", icon: BoardIcon, matches: (r) => r.page === "board" },
  { path: "/search", label: "Search", icon: SearchIcon, matches: (r) => r.page === "search" },
];

function newProject() {
  const name = prompt("Project name")?.trim();
  if (name) navigate(projectPath(createProject(name)));
}

function ProjectSwitcher({ route }: { route: Route }) {
  const projects = listProjects();
  const current = projects.find((p) => p.id === route.projectId);
  return (
    <Menu menu="project" class="project-menu" title="Switch project" trigger={[<span class="project-name">{current?.name ?? "Projects"}</span>, <ChevronIcon />]}>
      <MenuHeading>Projects</MenuHeading>
      {projects.map((project) => (
        <MenuItem key={project.id} class="project-item" selected={project.id === route.projectId} onSelect={() => navigate(projectPath(project.id))}>
          <span class="project-key">{project.key}</span>
          {project.name}
        </MenuItem>
      ))}
      <MenuItem key="new" class="project-item new-project" onSelect={newProject}>
        <PlusIcon />
        New project
      </MenuItem>
    </Menu>
  );
}

function RecentIssues({ route }: { route: Route }) {
  const recent = when(["recent", $.id, "viewedAt", $.at], ["recent", $.id, "project", $.project]).sort((a, b) => Number(b.at) - Number(a.at));
  if (recent.length === 0) return null;
  return (
    <div class="left-menu-section">
      <div class="left-menu-heading">Recent</div>
      {recent.map(({ id, project }) => {
        const issueId = String(id);
        const title = readValue("issue", issueId, "title") ?? readValue("recent", issueId, "title") ?? "Untitled";
        const href = projectPath(String(project), `/issue/${issueId}`);
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
  const pending = Number(when(["sync", "pending", $.n])[0]?.n ?? 0);
  const error = when(["sync", "error", $.message])[0]?.message;
  if (error) return <div class="sync-badge error">{`Sync error: ${String(error)}`}</div>;
  if (status === "standalone") return <div class="sync-badge standalone">Local database · no sync configured</div>;
  if (status === "live") return <div class="sync-badge synced">{pending > 0 ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…` : "Synced with Electric"}</div>;
  if (status === "syncing") return <div class="sync-badge syncing">Loading from Electric…</div>;
  return null;
}

export function LeftMenu({ route }: { route: Route }) {
  const base = route.projectId ? projectPath(route.projectId) : undefined;
  return (
    <nav class="left-menu">
      <div class="left-menu-brand">
        <span class="brand-mark">jam</span>
        <span class="brand-name">LinearLite</span>
      </div>
      <ProjectSwitcher route={route} />
      {base && (
        <button type="button" class="button primary new-issue-button" onClick={() => openModal(NEW_ISSUE_MODAL)}>
          <PlusIcon />
          New issue
        </button>
      )}
      {base && (
        <div class="left-menu-section">
          <div class="left-menu-heading">Issues</div>
          {NAV.map((item) => {
            const href = base + item.path;
            return (
              <a key={item.path} class={item.matches(route) ? "nav-link active" : "nav-link"} href={href} onClick={link(href)}>
                {item.icon()}
                {item.label}
              </a>
            );
          })}
        </div>
      )}
      <RecentIssues route={route} />
      <div class="left-menu-footer">
        <SyncBadge />
      </div>
    </nav>
  );
}
