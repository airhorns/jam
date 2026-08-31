import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { $, when } from "@jam/core";
import {
  Button,
  Menu,
  ListItem,
  ScrollView,
  Separator,
  SizableText,
  Square,
  Tooltip,
  XStack,
  YStack,
  getActiveThemeName,
  setTheme,
} from "@jam/ui";
import { readValue } from "../facts";
import { createProject } from "../mutations";
import { listProjects, projectPath } from "../projects";
import { navigate, type Route } from "../programs/router";
import { closeMenus, isMenuOpen, openMenu, openModal } from "../programs/ui";
import { BoardIcon, ChevronIcon, ListIcon, PlusIcon, SearchIcon } from "./icons";
import { link } from "./links";
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

/** A sidebar row that navigates: a real anchor styled as a ListItem. */
function NavLink({
  href,
  active,
  icon,
  label,
  testId,
  size = "$2",
}: {
  href: string;
  active: boolean;
  icon?: VChild;
  label: string;
  testId: string;
  size?: string;
}) {
  return (
    <ListItem.Frame
      tag="a"
      href={href}
      onClick={link(href)}
      size={size}
      minHeight={28}
      paddingVertical="$1.5"
      paddingHorizontal="$2.5"
      gap="$2"
      justifyContent="flex-start"
      borderRadius="$3"
      backgroundColor="transparent"
      active={active}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
    >
      {icon}
      <ListItem.Title size={size} color={active ? "$color12" : "$color11"} fontWeight={active ? "600" : "400"}>
        {label}
      </ListItem.Title>
    </ListItem.Frame>
  );
}

function SectionHeading({ children }: { children?: VChild }) {
  return (
    <SizableText size="$1" fontWeight="600" color="$color10" textTransform="uppercase" letterSpacing={0.6} paddingHorizontal="$2.5" paddingVertical="$1">
      {children}
    </SizableText>
  );
}

function ProjectSwitcher({ route }: { route: Route }) {
  const menu = "project";
  const projects = listProjects();
  const current = projects.find((p) => p.id === route.projectId);
  return (
    <Menu open={isMenuOpen(menu)} onOpenChange={(next) => (next ? openMenu(menu) : closeMenus())}>
      <Menu.Trigger asChild>
        <Button
          size="$3"
          variant="outlined"
          justifyContent="space-between"
          width="100%"
          data-testid="project-menu-trigger"
          title="Switch project"
        >
          <SizableText size="$3" fontWeight="500" ellipsis data-testid="project-name">
            {current?.name ?? "Projects"}
          </SizableText>
          <ChevronIcon />
        </Button>
      </Menu.Trigger>
      <Menu.Content data-testid="menu-content" minWidth={212}>
        <Menu.RadioGroup value={route.projectId} onValueChange={(id) => navigate(projectPath(id))}>
          <Menu.Label>Projects</Menu.Label>
          {projects.map((project) => (
            <Menu.RadioItem key={project.id} value={project.id} size="$2" data-testid="project-item" data-project={project.id}>
              <Menu.ItemIndicator forceMount />
              <SizableText size="$1" fontWeight="600" color="$color10" minWidth={34}>
                {project.key}
              </SizableText>
              <SizableText size="$2" flexGrow={1}>
                {project.name}
              </SizableText>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.Item key="new" size="$2" data-testid="new-project-item" onSelect={newProject}>
          <PlusIcon />
          <SizableText size="$2">New project</SizableText>
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}

function RecentIssues({ route }: { route: Route }) {
  const recent = when(["recent", $.id, "viewedAt", $.at], ["recent", $.id, "project", $.project]).sort((a, b) => Number(b.at) - Number(a.at));
  if (recent.length === 0) return null;
  return (
    <YStack gap={1}>
      <SectionHeading>Recent</SectionHeading>
      {recent.map(({ id, project }) => {
        const issueId = String(id);
        const title = readValue("issue", issueId, "title") ?? readValue("recent", issueId, "title") ?? "Untitled";
        const href = projectPath(String(project), `/issue/${issueId}`);
        return <NavLink key={issueId} href={href} active={route.issueId === issueId} label={String(title)} testId="recent-link" size="$1" />;
      })}
    </YStack>
  );
}

function SyncBadge() {
  const status = when(["sync", "status", $.status])[0]?.status;
  const pending = Number(when(["sync", "pending", $.n])[0]?.n ?? 0);
  const error = when(["sync", "error", $.message])[0]?.message;
  const badge = (text: string, theme?: string) => (
    <SizableText
      size="$1"
      theme={theme}
      padding="$2.5"
      borderRadius="$3"
      backgroundColor={theme ? "$color4" : "$color3"}
      color={theme ? "$color12" : "$color11"}
      data-testid="sync-badge"
    >
      {text}
    </SizableText>
  );
  if (error) return badge(`Sync error: ${String(error)}`, "red");
  if (status === "standalone") return badge("Local database · no sync configured");
  if (status === "live") return badge(pending > 0 ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…` : "Synced", "green");
  if (status === "syncing") return badge("Loading from the server…", "blue");
  if (status === "connecting") return badge("Connecting…", "blue");
  if (status === "offline") return badge(pending > 0 ? `Offline · ${pending} change${pending === 1 ? "" : "s"} waiting` : "Offline", "orange");
  return null;
}

function ThemeToggle() {
  const dark = (getActiveThemeName() ?? "light").startsWith("dark");
  return (
    <Tooltip placement="top">
      <Tooltip.Trigger asChild>
        <Button
          size="$2"
          chromeless
          circular
          aria-label="Dark theme"
          aria-pressed={dark ? "true" : "false"}
          data-testid="theme-toggle"
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? "☾" : "☀"}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <Tooltip.Arrow />
        {dark ? "Switch to light" : "Switch to dark"}
      </Tooltip.Content>
    </Tooltip>
  );
}

export function LeftMenu({ route }: { route: Route }) {
  const base = route.projectId ? projectPath(route.projectId) : undefined;
  return (
    <ScrollView
      tag="nav"
      width={232}
      $max-md={{ width: 180 }}
      flexShrink={0}
      gap="$3.5"
      paddingVertical="$3.5"
      paddingHorizontal="$2.5"
      backgroundColor="$color2"
      borderRightWidth={1}
      borderColor="$borderColor"
      data-testid="left-menu"
    >
      <XStack alignItems="center" gap="$2" paddingHorizontal="$1.5">
        <Square size={24} borderRadius="$3" backgroundColor="$blue10" alignItems="center" justifyContent="center">
          <SizableText size="$1" fontSize={11} fontWeight="700" color="$blue1">
            jam
          </SizableText>
        </Square>
        <SizableText size="$3" fontWeight="600" flexGrow={1}>
          LinearLite
        </SizableText>
        <ThemeToggle />
      </XStack>

      <ProjectSwitcher route={route} />

      {base && (
        <Button
          key="new-issue"
          size="$3"
          theme="blue_accent"
          icon={<PlusIcon />}
          data-testid="new-issue-button"
          onClick={() => openModal(NEW_ISSUE_MODAL)}
        >
          New issue
        </Button>
      )}

      {base && (
        <YStack key="views" gap={1}>
          <SectionHeading>Issues</SectionHeading>
          {NAV.map((item) => (
            <NavLink key={item.path} href={base + item.path} active={item.matches(route)} icon={item.icon()} label={item.label} testId="nav-link" />
          ))}
        </YStack>
      )}

      <RecentIssues route={route} />

      <YStack marginTop="auto" gap="$2">
        <Separator />
        <SyncBadge />
      </YStack>
    </ScrollView>
  );
}
