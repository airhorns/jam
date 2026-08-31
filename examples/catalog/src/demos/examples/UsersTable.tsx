import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import {
  XStack,
  YStack,
  Card,
  Avatar,
  Button,
  Checkbox,
  Circle,
  Input,
  Popover,
  ScrollView,
  Separator,
  SizableText,
  H4,
  styled,
  useStableId,
  rovingFocus,
} from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  Trash2Icon,
  XIcon,
} from "./icons";

// ---- Data ----

type Status = "Active" | "Invited" | "Suspended";

type User = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Member" | "Viewer";
  status: Status;
  lastActive: string;
  /** Minutes since last activity, for sorting; `Infinity` for never. */
  lastActiveMinutes: number;
  theme: string;
};

const users: User[] = [
  { id: "ada", name: "Ada Lovelace", email: "ada@analytical.engine", role: "Owner", status: "Active", lastActive: "2 minutes ago", lastActiveMinutes: 2, theme: "purple" },
  { id: "grace", name: "Grace Hopper", email: "grace.hopper@cobol.navy.mil", role: "Admin", status: "Active", lastActive: "1 hour ago", lastActiveMinutes: 60, theme: "blue" },
  { id: "alan", name: "Alan Turing", email: "alan@bletchley.park", role: "Member", status: "Invited", lastActive: "Never", lastActiveMinutes: Infinity, theme: "green" },
  { id: "katherine", name: "Katherine Coleman Goble Johnson", email: "katherine.johnson@flight-research-division.nasa.gov", role: "Member", status: "Active", lastActive: "Yesterday", lastActiveMinutes: 60 * 24, theme: "orange" },
  { id: "linus", name: "Linus Torvalds", email: "torvalds@kernel.org", role: "Admin", status: "Suspended", lastActive: "3 weeks ago", lastActiveMinutes: 60 * 24 * 21, theme: "yellow" },
  { id: "margaret", name: "Margaret Hamilton", email: "margaret@apollo.mit.edu", role: "Member", status: "Active", lastActive: "4 hours ago", lastActiveMinutes: 240, theme: "pink" },
  { id: "dennis", name: "Dennis Ritchie", email: "dmr@bell-labs.com", role: "Viewer", status: "Invited", lastActive: "Never", lastActiveMinutes: Infinity, theme: "red" },
  { id: "barbara", name: "Barbara Liskov", email: "liskov@csail.mit.edu", role: "Member", status: "Active", lastActive: "3 days ago", lastActiveMinutes: 60 * 24 * 3, theme: "gray" },
];

const pageSize = 5;

const initials = (name: string) =>
  name
    .split(" ")
    .filter((_, i, parts) => i === 0 || i === parts.length - 1)
    .map((part) => part[0])
    .join("");

// ---- Table parts ----

const TableFrame = styled(YStack, {
  tag: "table",
  defaultProps: { width: "100%", minWidth: 640, flexShrink: 0 },
});

const TableScroller = styled(ScrollView, {
  defaultProps: { horizontal: true, width: "100%" },
});

const TableHead = styled(YStack, {
  tag: "thead",
  defaultProps: {
    flexShrink: 0,
    backgroundColor: "$background",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "$borderColor",
  },
});

const TableBody = styled(YStack, { tag: "tbody", defaultProps: { flexShrink: 0 } });

const TableRow = styled(XStack, {
  tag: "tr",
  defaultProps: { flexShrink: 0 },
  variants: {
    alt: { true: { backgroundColor: "$color005" } },
    interactive: {
      true: { hoverStyle: { backgroundColor: "$color0075" } },
    },
    highlighted: { true: { backgroundColor: "$blue3", hoverStyle: { backgroundColor: "$blue4" } } },
  },
});

const TableCell = styled(XStack, {
  tag: "td",
  defaultProps: {
    alignItems: "center",
    paddingHorizontal: "$space.3",
    overflow: "hidden",
  },
});

const TableHeaderCell = styled(TableCell, { tag: "th" });

const Table = Object.assign(TableFrame, {
  Head: TableHead,
  Body: TableBody,
  Row: TableRow,
  Cell: TableCell,
  HeaderCell: TableHeaderCell,
});

const HeaderLabel = styled(SizableText, {
  defaultProps: {
    size: "$1",
    fontWeight: "600",
    color: "$color10",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    ellipsis: true,
  },
});

type Column = { key: string; label: string; width?: number; flex?: number; sortable?: boolean };

const columns: Column[] = [
  { key: "name", label: "Name", flex: 1, sortable: true },
  { key: "role", label: "Role", width: 110, sortable: true },
  { key: "status", label: "Status", width: 130, sortable: true },
  { key: "lastActive", label: "Last active", width: 140, sortable: true },
];

const cellLayout = (col: Column) => ({ width: col.width, flex: col.flex, flexShrink: col.flex ? 1 : 0 });

// ---- Pieces ----

const statusTheme: Record<Status, string> = { Active: "green", Invited: "yellow", Suspended: "red" };

function StatusChip({ status }: { status: Status }) {
  return (
    <XStack
      theme={statusTheme[status]}
      alignItems="center"
      gap={6}
      height={22}
      paddingHorizontal={8}
      borderRadius={999}
      backgroundColor="$color3"
      flexShrink={0}
    >
      <Circle size={6} backgroundColor="$color9" />
      <SizableText size="$1" fontWeight="600" color="$color11">
        {status}
      </SizableText>
    </XStack>
  );
}

function UserCell({ user, dense }: { user: User; dense: boolean }) {
  return (
    <XStack alignItems="center" gap="$space.3" flex={1}>
      <Avatar size={dense ? 24 : 36} circular theme={user.theme} flexShrink={0}>
        <Avatar.Fallback backgroundColor="$color5">
          <SizableText size={dense ? "$1" : "$2"} fontWeight="600" color="$color11">
            {initials(user.name)}
          </SizableText>
        </Avatar.Fallback>
      </Avatar>
      <YStack flex={1}>
        <SizableText size={dense ? "$2" : "$3"} fontWeight="500" ellipsis>
          {user.name}
        </SizableText>
        {dense ? null : (
          <SizableText size="$1" color="$color10" ellipsis>
            {user.email}
          </SizableText>
        )}
      </YStack>
    </XStack>
  );
}

function RowMenu({ user, testId }: { user: User; testId?: string }) {
  const item = (label: string, icon: VChild, first: boolean, theme?: string) => (
    <Popover.Close asChild>
      <Button size="$3" variant="ghost" role="menuitem" tabIndex={first ? 0 : -1} theme={theme} justifyContent="flex-start" width="100%" icon={icon}>
        {label}
      </Button>
    </Popover.Close>
  );
  return (
    <Popover placement="bottom-end">
      <Popover.Trigger asChild>
        <Button
          size="$2"
          variant="ghost"
          circular
          aria-label={`Actions for ${user.name}`}
          icon={<MoreHorizontalIcon size={16} />}
          data-testid={testId}
        />
      </Popover.Trigger>
      <Popover.Content
        role="menu"
        aria-label={`Actions for ${user.name}`}
        size="$3"
        padding="$space.1.5"
        width={180}
        onKeyDown={(e: KeyboardEvent) => rovingFocus(e, "[role=menuitem]", { orientation: "vertical" })}
      >
        <YStack>
          {item("Edit", <PencilIcon size={14} />, true)}
          {item("Suspend", <ShieldIcon size={14} />, false)}
          <Separator marginVertical="$space.1.5" />
          {item("Remove", <Trash2Icon size={14} />, false, "red")}
        </YStack>
      </Popover.Content>
    </Popover>
  );
}

// ---- Table ----

type SortDir = "asc" | "desc";

function useSort(stateKey: string): { key: string | null; dir: SortDir; toggle: (key: string) => void } {
  const [raw, setRaw] = useDemoState(`${stateKey}.sort`, "");
  const [key, dir] = raw ? raw.split(":") : [null, "asc"];
  return {
    key,
    dir: dir as SortDir,
    toggle: (next) => setRaw(next === key && dir === "asc" ? `${next}:desc` : `${next}:asc`),
  };
}

function useSelection(stateKey: string): { ids: string[]; set: (ids: string[]) => void } {
  const [raw, setRaw] = useDemoState(`${stateKey}.selected`, "[]");
  return { ids: JSON.parse(raw) as string[], set: (ids) => setRaw(JSON.stringify(ids)) };
}

const sortValue = (user: User, key: string): string | number =>
  key === "lastActive" ? user.lastActiveMinutes : String(user[key as keyof User]);

function sortUsers(list: User[], key: string | null, dir: SortDir): User[] {
  if (!key) return list;
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    return (av < bv ? -1 : av > bv ? 1 : 0) * sign;
  });
}

type UsersTableProps = {
  stateKey: string;
  rows: User[];
  sortable?: boolean;
  selectable?: boolean;
  dense?: boolean;
  stickyHeader?: boolean;
  menuTestId?: string;
};

function UsersTable({ stateKey, rows, sortable = false, selectable = false, dense = false, stickyHeader = false, menuTestId }: UsersTableProps) {
  const sort = useSort(stateKey);
  const selection = useSelection(stateKey);
  const sorted = sortable ? sortUsers(rows, sort.key, sort.dir) : rows;
  const rowHeight = dense ? 36 : 56;
  const headerHeight = dense ? 32 : 40;
  const visibleIds = sorted.map((u) => u.id);
  const selectedVisible = visibleIds.filter((id) => selection.ids.includes(id));
  const allChecked: boolean | "indeterminate" =
    selectedVisible.length === 0 ? false : selectedVisible.length === visibleIds.length ? true : "indeterminate";

  const toggleRow = (id: string) =>
    selection.set(selection.ids.includes(id) ? selection.ids.filter((x) => x !== id) : [...selection.ids, id]);

  const header = (col: Column) => {
    const active = sortable && sort.key === col.key;
    const label = <HeaderLabel>{col.label}</HeaderLabel>;
    if (!sortable || !col.sortable) return label;
    return (
      <Button
        unstyled
        display="flex"
        alignItems="center"
        gap="$space.1.5"
        padding={0}
        borderRadius="$radius.1"
        cursor="pointer"
        color={active ? "$color12" : "$color10"}
        hoverStyle={{ color: "$color12" }}
        focusVisibleStyle={{ outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 4 }}
        onClick={() => sort.toggle(col.key)}
        data-testid={`${stateKey}-sort-${col.key}`}
      >
        <HeaderLabel color="inherit">{col.label}</HeaderLabel>
        {active ? (sort.dir === "asc" ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />) : null}
      </Button>
    );
  };

  return (
    <Table>
      <Table.Head position={stickyHeader ? "sticky" : undefined} top={stickyHeader ? 0 : undefined} zIndex={stickyHeader ? 1 : undefined}>
        <Table.Row height={headerHeight} backgroundColor="$color005">
          {selectable ? (
            <Table.HeaderCell width={48} justifyContent="center" paddingHorizontal={0}>
              <Checkbox
                size="$3"
                checked={allChecked}
                onCheckedChange={(next) => selection.set(next === true ? visibleIds : [])}
                aria-label="Select all"
                data-testid={`${stateKey}-select-all`}
              >
                <Checkbox.Indicator />
              </Checkbox>
            </Table.HeaderCell>
          ) : null}
          {columns.map((col) => {
            const isSortableCol = sortable && col.sortable;
            const active = isSortableCol && sort.key === col.key;
            return (
              <Table.HeaderCell
                key={col.key}
                {...cellLayout(col)}
                aria-sort={!isSortableCol ? undefined : active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                {header(col)}
              </Table.HeaderCell>
            );
          })}
          <Table.HeaderCell width={56} paddingHorizontal={0} />
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {sorted.length === 0 ? (
          <Table.Row minHeight={rowHeight * 2}>
            <Table.Cell flex={1} justifyContent="center">
              <SizableText size="$3" color="$color10">
                No members match your search
              </SizableText>
            </Table.Cell>
          </Table.Row>
        ) : null}
        {sorted.map((user, i) => {
          const checked = selection.ids.includes(user.id);
          return (
            <Table.Row
              key={user.id}
              minHeight={rowHeight}
              interactive
              alt={!checked && i % 2 === 1}
              highlighted={checked}
              aria-selected={selectable ? checked : undefined}
            >
              {selectable ? (
                <Table.Cell width={48} justifyContent="center" paddingHorizontal={0}>
                  <Checkbox
                    size="$3"
                    checked={checked}
                    onCheckedChange={() => toggleRow(user.id)}
                    aria-label={`Select ${user.name}`}
                    data-testid={`${stateKey}-select-${i}`}
                  >
                    <Checkbox.Indicator />
                  </Checkbox>
                </Table.Cell>
              ) : null}
              <Table.Cell {...cellLayout(columns[0])}>
                <UserCell user={user} dense={dense} />
              </Table.Cell>
              <Table.Cell {...cellLayout(columns[1])}>
                <SizableText size={dense ? "$2" : "$3"} color="$color11" ellipsis>
                  {user.role}
                </SizableText>
              </Table.Cell>
              <Table.Cell {...cellLayout(columns[2])}>
                <StatusChip status={user.status} />
              </Table.Cell>
              <Table.Cell {...cellLayout(columns[3])}>
                <SizableText size={dense ? "$2" : "$3"} color="$color11" ellipsis>
                  {user.lastActive}
                </SizableText>
              </Table.Cell>
              <Table.Cell width={56} justifyContent="center" paddingHorizontal={0}>
                <RowMenu user={user} testId={i === 0 ? menuTestId : undefined} />
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

// ---- Screens ----

const Panel = styled(Card, {
  defaultProps: { bordered: true, elevate: true, width: "100%", maxWidth: 900, alignSelf: "center" },
});

function SearchField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <XStack alignItems="center" position="relative" width={240} flexShrink={1}>
      <XStack position="absolute" left={10} color="$color10" pointerEvents="none" zIndex={1}>
        <SearchIcon size={14} />
      </XStack>
      <Input id={id} size="$3" width="100%" paddingLeft={32} placeholder="Search members" aria-label="Search members" value={value} onChangeText={onChange} />
    </XStack>
  );
}

function MembersCard() {
  const stateKey = "userstable.members";
  const id = useStableId();
  const [search, setSearch] = useDemoState(`${stateKey}.search`, "");
  const [pageState, setPage] = useDemoState(`${stateKey}.page`, 0);
  const query = search.trim().toLowerCase();
  const matches = query ? users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query)) : users;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(pageState, pageCount - 1);
  const rows = matches.slice(page * pageSize, (page + 1) * pageSize);
  const first = matches.length === 0 ? 0 : page * pageSize + 1;
  const last = page * pageSize + rows.length;
  return (
    <Panel>
      <XStack alignItems="center" justifyContent="space-between" gap="$space.3" padding="$space.4" flexWrap="wrap">
        <YStack gap={2} flexShrink={0}>
          <H4 size="$6" margin={0}>Members</H4>
          <SizableText size="$2" color="$color10">
            People with access to this workspace
          </SizableText>
        </YStack>
        <XStack alignItems="center" gap="$space.2">
          <SearchField id={`${id}-search`} value={search} onChange={setSearch} />
          <Button size="$3" theme="accent" icon={<PlusIcon size={14} />}>
            Invite
          </Button>
        </XStack>
      </XStack>
      <TableScroller>
        <UsersTable stateKey={stateKey} rows={rows} menuTestId="userstable-menu-0" />
      </TableScroller>
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$space.3"
        flexWrap="wrap"
        paddingHorizontal="$space.4"
        paddingVertical="$space.3"
        borderTopWidth={1}
        borderTopStyle="solid"
        borderTopColor="$borderColor"
      >
        <SizableText size="$2" color="$color10" aria-live="polite">
          {query
            ? `${matches.length} of ${users.length} members match “${search.trim()}”`
            : `Showing ${first}–${last} of ${users.length}`}
        </SizableText>
        <XStack gap="$space.2" alignItems="center">
          <SizableText size="$2" color="$color10">
            Page {page + 1} of {pageCount}
          </SizableText>
          <Button
            size="$2"
            variant="outlined"
            aria-label="Previous page"
            icon={<ChevronLeftIcon size={14} />}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            data-testid={`${stateKey}-prev`}
          />
          <Button
            size="$2"
            variant="outlined"
            aria-label="Next page"
            icon={<ChevronRightIcon size={14} />}
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
            data-testid={`${stateKey}-next`}
          />
        </XStack>
      </XStack>
    </Panel>
  );
}

function SortableCard() {
  return (
    <Panel>
      <TableScroller>
        <UsersTable stateKey="userstable.sortable" rows={users} sortable />
      </TableScroller>
    </Panel>
  );
}

function SelectableCard() {
  const stateKey = "userstable.selectable";
  const selection = useSelection(stateKey);
  const count = selection.ids.length;
  return (
    <Panel>
      {count > 0 ? (
        <XStack
          alignItems="center"
          gap="$space.3"
          paddingHorizontal="$space.4"
          paddingVertical="$space.2"
          theme="accent"
          backgroundColor="$background"
          animation="quick"
          enterStyle={{ opacity: 0, y: -6 }}
          data-testid={`${stateKey}-bulk-bar`}
        >
          <SizableText size="$3" fontWeight="600" flex={1}>
            {count} selected
          </SizableText>
          <Button size="$2" variant="outlined" icon={<ShieldIcon size={14} />}>
            Suspend
          </Button>
          <Button size="$2" variant="outlined" icon={<Trash2Icon size={14} />}>
            Remove
          </Button>
          <Button size="$2" variant="ghost" circular aria-label="Clear selection" icon={<XIcon size={14} />} onClick={() => selection.set([])} />
        </XStack>
      ) : null}
      <TableScroller>
        <UsersTable stateKey={stateKey} rows={users} selectable />
      </TableScroller>
    </Panel>
  );
}

function CompactCard() {
  return (
    <Panel>
      <ScrollView height={220} overflowX="auto">
        <UsersTable stateKey="userstable.compact" rows={[...users, ...users.map((u) => ({ ...u, id: `${u.id}-2` }))]} dense stickyHeader />
      </ScrollView>
    </Panel>
  );
}

export const UsersTableExample: ComponentDemos = {
  name: "Users table",
  group: "Examples",
  description: "A members table built from stacks: avatars, status chips, a row action menu, sortable headers, row selection with a bulk-action bar, and a dense scrolling variant.",
  demos: [
    {
      title: "Users",
      description: "Header with search and invite, striped hoverable rows, status chips, a row menu and pagination.",
      render: () => <MembersCard />,
      shot: { click: "userstable-menu-0", wait: 300 },
    },
    {
      title: "Sortable",
      description: "Clicking a column header sorts by it; clicking again flips the direction.",
      render: () => <SortableCard />,
      shot: { click: "userstable.sortable-sort-name", wait: 200 },
    },
    {
      title: "Selectable",
      description: "A leading checkbox column with a select-all header; a bulk-action bar appears once any row is selected.",
      render: () => <SelectableCard />,
      shot: { click: ["userstable.selectable-select-1", "userstable.selectable-select-3"], wait: 300 },
    },
    {
      title: "Compact / dense",
      description: "The same data at a smaller size inside a 220px scroll view with a sticky header.",
      render: () => <CompactCard />,
    },
  ],
};
