import { h } from "@jam/core/jsx";
import { $, replace, when } from "@jam/core";
import { queryMeta, readValue } from "../facts";
import { filterStateToParams, type FilterState } from "../filter-state";
import { navigate, type Route } from "../programs/router";
import {
  PriorityDisplay,
  PriorityValues,
  StatusDisplay,
  StatusValues,
  type PriorityValue,
  type StatusValue,
} from "../types";
import { CloseIcon, FilterIcon, PriorityIcon, SortIcon, StatusIcon } from "./icons";
import { Menu, MenuHeading, MenuItem } from "./Menu";

const SEARCH_DEBOUNCE = 200;

const SORT_OPTIONS: Array<[FilterState["orderBy"], string]> = [
  ["created", "Created"],
  ["modified", "Last modified"],
  ["title", "Title"],
  ["priority", "Priority"],
  ["status", "Status"],
];

function applyFilter(route: Route, patch: Partial<FilterState>, replaceHistory = false) {
  const params = filterStateToParams(patch, route.params).toString();
  navigate(params ? `${route.path}?${params}` : route.path, { replace: replaceHistory });
}

function toggle<T extends string>(values: string[], value: T): T[] {
  return (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]) as T[];
}

function pageTitle(route: Route): string {
  if (route.page === "board") return "Board";
  if (route.page === "search") return "Search";
  const statuses = [...route.filter.status].sort().join(",");
  if (statuses === "backlog") return "Backlog";
  if (statuses === "in_progress,todo") return "Active";
  return "All issues";
}

function shownCount(route: Route): number {
  if (route.page === "board") {
    return StatusValues.reduce((sum, status) => sum + queryMeta(`board:${status}`).total, 0);
  }
  return queryMeta("list").total;
}

function FilterMenu({ route }: { route: Route }) {
  return (
    <Menu
      menu="filter"
      class="filter-menu"
      align="right"
      title="Filter"
      trigger={[<FilterIcon />, <span class="menu-trigger-label">Filter</span>]}
    >
      <MenuHeading>Status</MenuHeading>
      {StatusValues.map((status) => (
        <MenuItem
          key={`status-${status}`}
          keepOpen
          selected={route.filter.status.includes(status)}
          onSelect={() => applyFilter(route, { status: toggle(route.filter.status, status) })}
        >
          <StatusIcon status={status} />
          {StatusDisplay[status]}
        </MenuItem>
      ))}
      <MenuHeading>Priority</MenuHeading>
      {PriorityValues.map((priority) => (
        <MenuItem
          key={`priority-${priority}`}
          keepOpen
          selected={route.filter.priority.includes(priority)}
          onSelect={() => applyFilter(route, { priority: toggle(route.filter.priority, priority) })}
        >
          <PriorityIcon priority={priority} />
          {PriorityDisplay[priority]}
        </MenuItem>
      ))}
    </Menu>
  );
}

function SortMenu({ route }: { route: Route }) {
  const { orderBy, orderDirection } = route.filter;
  const label = SORT_OPTIONS.find(([key]) => key === orderBy)?.[1] ?? orderBy;
  return (
    <Menu
      menu="sort"
      class="sort-menu"
      align="right"
      title="Sort"
      trigger={[<SortIcon />, <span class="menu-trigger-label">{`${label} · ${orderDirection === "asc" ? "↑" : "↓"}`}</span>]}
    >
      <MenuHeading>Sort by</MenuHeading>
      {SORT_OPTIONS.map(([key, name]) => (
        <MenuItem key={key} selected={key === orderBy} onSelect={() => applyFilter(route, { orderBy: key })}>
          {name}
        </MenuItem>
      ))}
      <MenuHeading>Direction</MenuHeading>
      <MenuItem key="asc" selected={orderDirection === "asc"} onSelect={() => applyFilter(route, { orderDirection: "asc" })}>
        Ascending
      </MenuItem>
      <MenuItem key="desc" selected={orderDirection === "desc"} onSelect={() => applyFilter(route, { orderDirection: "desc" })}>
        Descending
      </MenuItem>
    </Menu>
  );
}

function FilterChips({ route }: { route: Route }) {
  const { status, priority } = route.filter;
  if (status.length === 0 && priority.length === 0) return null;
  return (
    <div class="filter-chips">
      {status.map((value) => (
        <button
          key={`status-${value}`}
          type="button"
          class="chip"
          data-filter="status"
          data-value={value}
          onClick={() => applyFilter(route, { status: toggle(status, value as StatusValue) })}
        >
          <StatusIcon status={value} />
          {StatusDisplay[value as StatusValue] ?? value}
          <CloseIcon />
        </button>
      ))}
      {priority.map((value) => (
        <button
          key={`priority-${value}`}
          type="button"
          class="chip"
          data-filter="priority"
          data-value={value}
          onClick={() => applyFilter(route, { priority: toggle(priority, value as PriorityValue) })}
        >
          <PriorityIcon priority={value} />
          {PriorityDisplay[value as PriorityValue] ?? value}
          <CloseIcon />
        </button>
      ))}
      <button type="button" class="chip clear-filters" onClick={() => applyFilter(route, { status: [], priority: [] })}>
        Clear
      </button>
    </div>
  );
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function SearchBox({ route }: { route: Route }) {
  const text = readValue("ui", "search", "text");
  const value = typeof text === "string" ? text : route.filter.query ?? "";
  return (
    <input
      class="search-input"
      type="search"
      placeholder="Search issues…"
      autocomplete="off"
      value={value}
      onInput={(event: Event) => {
        const next = (event.target as HTMLInputElement).value;
        replace("ui", "search", "text", next);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => applyFilter(route, { query: next.trim() || undefined }, true), SEARCH_DEBOUNCE);
      }}
    />
  );
}

function syncSummary(): string | null {
  const status = when(["sync", "status", $.status])[0]?.status;
  if (status === "standalone") return "Local only";
  if (status === "done") return "Synced";
  return null;
}

export function TopFilter({ route }: { route: Route }) {
  const total = Number(readValue("stats", "issues", "total") ?? 0);
  const shown = shownCount(route);
  const sync = syncSummary();
  return (
    <div class="top-filter">
      <div class="top-filter-row">
        <h1 class="page-title">{pageTitle(route)}</h1>
        <span class="issue-count">
          {shown} of {total} issues
        </span>
        {route.page === "search" && <SearchBox key="search" route={route} />}
        <span class="top-filter-spacer" key="spacer" />
        {sync && (
          <span class="sync-summary" key="sync">
            {sync}
          </span>
        )}
        <FilterMenu key="filter" route={route} />
        {route.page !== "board" && <SortMenu key="sort" route={route} />}
      </div>
      <FilterChips route={route} />
    </div>
  );
}
