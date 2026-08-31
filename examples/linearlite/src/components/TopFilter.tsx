import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { replace } from "@jam/core";
import { Button, H1, Input, Menu, SizableText, XStack, YStack } from "@jam/ui";
import { queryMeta, readValue } from "../facts";
import { filterStateToParams, type FilterState } from "../filter-state";
import { currentRoute, navigate, type Route } from "../programs/router";
import { closeMenus, isMenuOpen, openMenu } from "../programs/ui";
import {
  PriorityDisplay,
  PriorityValues,
  StatusDisplay,
  StatusValues,
  type PriorityValue,
  type StatusValue,
} from "../types";
import { CloseIcon, FilterIcon, PriorityIcon, SortIcon, StatusIcon } from "./icons";

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
  const menu = "filter";
  return (
    <Menu placement="bottom-end" open={isMenuOpen(menu)} onOpenChange={(next) => (next ? openMenu(menu) : closeMenus())}>
      <Menu.Trigger asChild>
        <Button size="$2" variant="outlined" gap="$2" data-menu={menu} data-testid="filter-menu-trigger" aria-label="Filter">
          <FilterIcon />
          <SizableText size="$2" whiteSpace="nowrap">
            Filter
          </SizableText>
        </Button>
      </Menu.Trigger>
      <Menu.Content data-menu={menu} data-testid="menu-content" minWidth={220}>
        <Menu.Group>
          <Menu.Label>Status</Menu.Label>
          {StatusValues.map((status) => (
            <Menu.CheckboxItem
              key={`status-${status}`}
              size="$2"
              data-testid="menu-item"
              data-value={status}
              checked={route.filter.status.includes(status)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => applyFilter(route, { status: toggle(route.filter.status, status) })}
            >
              <Menu.ItemIndicator forceMount />
              <StatusIcon status={status} />
              <SizableText size="$2" flexGrow={1}>
                {StatusDisplay[status]}
              </SizableText>
            </Menu.CheckboxItem>
          ))}
        </Menu.Group>
        <Menu.Separator />
        <Menu.Group>
          <Menu.Label>Priority</Menu.Label>
          {PriorityValues.map((priority) => (
            <Menu.CheckboxItem
              key={`priority-${priority}`}
              size="$2"
              data-testid="menu-item"
              data-value={priority}
              checked={route.filter.priority.includes(priority)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => applyFilter(route, { priority: toggle(route.filter.priority, priority) })}
            >
              <Menu.ItemIndicator forceMount />
              <PriorityIcon priority={priority} />
              <SizableText size="$2" flexGrow={1}>
                {PriorityDisplay[priority]}
              </SizableText>
            </Menu.CheckboxItem>
          ))}
        </Menu.Group>
      </Menu.Content>
    </Menu>
  );
}

function SortMenu({ route }: { route: Route }) {
  const menu = "sort";
  const { orderBy, orderDirection } = route.filter;
  const label = SORT_OPTIONS.find(([key]) => key === orderBy)?.[1] ?? orderBy;
  return (
    <Menu placement="bottom-end" open={isMenuOpen(menu)} onOpenChange={(next) => (next ? openMenu(menu) : closeMenus())}>
      <Menu.Trigger asChild>
        <Button size="$2" variant="outlined" gap="$2" data-menu={menu} data-testid="sort-menu-trigger" aria-label="Sort">
          <SortIcon />
          <SizableText size="$2" whiteSpace="nowrap">
            {`${label} · ${orderDirection === "asc" ? "↑" : "↓"}`}
          </SizableText>
        </Button>
      </Menu.Trigger>
      <Menu.Content data-menu={menu} data-testid="menu-content" minWidth={200}>
        <Menu.RadioGroup value={orderBy} onValueChange={(value) => applyFilter(route, { orderBy: value as FilterState["orderBy"] })}>
          <Menu.Label>Sort by</Menu.Label>
          {SORT_OPTIONS.map(([key, name]) => (
            <Menu.RadioItem key={key} value={key} size="$2" data-testid="menu-item" data-value={key}>
              <Menu.ItemIndicator forceMount />
              <SizableText size="$2" flexGrow={1}>
                {name}
              </SizableText>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.RadioGroup
          value={orderDirection}
          onValueChange={(value) => applyFilter(route, { orderDirection: value as FilterState["orderDirection"] })}
        >
          <Menu.Label>Direction</Menu.Label>
          <Menu.RadioItem key="asc" value="asc" size="$2" data-testid="menu-item" data-value="asc">
            <Menu.ItemIndicator forceMount />
            <SizableText size="$2" flexGrow={1}>
              Ascending
            </SizableText>
          </Menu.RadioItem>
          <Menu.RadioItem key="desc" value="desc" size="$2" data-testid="menu-item" data-value="desc">
            <Menu.ItemIndicator forceMount />
            <SizableText size="$2" flexGrow={1}>
              Descending
            </SizableText>
          </Menu.RadioItem>
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu>
  );
}

function FilterChip({ filter, value, label, icon, onRemove }: { filter: string; value: string; label: string; icon: VChild; onRemove: () => void }) {
  return (
    <Button
      size="$1"
      height={24}
      borderRadius={999}
      variant="outlined"
      gap="$2"
      paddingHorizontal="$3"
      iconAfter={<CloseIcon />}
      data-testid="filter-chip"
      data-filter={filter}
      data-value={value}
      aria-label={`Remove ${label} filter`}
      onClick={onRemove}
    >
      {icon}
      <SizableText size="$1" whiteSpace="nowrap">
        {label}
      </SizableText>
    </Button>
  );
}

function FilterChips({ route }: { route: Route }) {
  const { status, priority } = route.filter;
  if (status.length === 0 && priority.length === 0) return null;
  return (
    <XStack flexWrap="wrap" gap="$2" paddingHorizontal="$4" paddingBottom="$2.5" data-testid="filter-chips">
      {status.map((value) => (
        <FilterChip
          key={`status-${value}`}
          filter="status"
          value={value}
          label={StatusDisplay[value as StatusValue] ?? value}
          icon={<StatusIcon status={value} />}
          onRemove={() => applyFilter(route, { status: toggle(status, value as StatusValue) })}
        />
      ))}
      {priority.map((value) => (
        <FilterChip
          key={`priority-${value}`}
          filter="priority"
          value={value}
          label={PriorityDisplay[value as PriorityValue] ?? value}
          icon={<PriorityIcon priority={value} />}
          onRemove={() => applyFilter(route, { priority: toggle(priority, value as PriorityValue) })}
        />
      ))}
      <Button
        key="clear"
        size="$1"
        height={24}
        borderRadius={999}
        chromeless
        paddingHorizontal="$3"
        data-testid="clear-filters"
        onClick={() => applyFilter(route, { status: [], priority: [] })}
      >
        Clear
      </Button>
    </XStack>
  );
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function commitSearch(query: string) {
  const route = currentRoute();
  if (route.page !== "search") return;
  applyFilter(route, { query: query.trim() || undefined }, true);
}

function SearchBox({ route }: { route: Route }) {
  const text = readValue("ui", "search", "text");
  const value = typeof text === "string" ? text : route.filter.query ?? "";
  return (
    <Input
      size="$2"
      width={320}
      $max-md={{ width: 160 }}
      type="search"
      placeholder="Search issues…"
      autocomplete="off"
      aria-label="Search issues"
      data-testid="search-input"
      value={value}
      onChangeText={(next) => {
        replace("ui", "search", "text", next);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => commitSearch(next), SEARCH_DEBOUNCE);
      }}
    />
  );
}

export function TopFilter({ route }: { route: Route }) {
  const total = Number(readValue("stats", "issues", "total") ?? 0);
  const shown = shownCount(route);
  return (
    <YStack flexShrink={0} borderBottomWidth={1} borderColor="$borderColor" data-testid="top-filter">
      <XStack alignItems="center" gap="$3" height={48} paddingHorizontal="$4">
        <H1 size="$3" margin={0} whiteSpace="nowrap" data-testid="page-title">
          {pageTitle(route)}
        </H1>
        <SizableText size="$2" color="$color10" whiteSpace="nowrap" data-testid="issue-count">
          {shown} of {total} issues
        </SizableText>
        {route.page === "search" && <SearchBox key="search" route={route} />}
        <XStack key="spacer" flexGrow={1} />
        <FilterMenu key="filter" route={route} />
        {route.page !== "board" && <SortMenu key="sort" route={route} />}
      </XStack>
      <FilterChips route={route} />
    </YStack>
  );
}
