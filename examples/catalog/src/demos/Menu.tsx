import { h } from "@jam/core/jsx";
import { XStack, YStack, Menu, Button, Paragraph, SizableText } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

function ViewMenu() {
  const [showDone, setShowDone] = useDemoState("menu.showDone", true);
  const [showArchived, setShowArchived] = useDemoState("menu.showArchived", false);
  const [sort, setSort] = useDemoState("menu.sort", "modified");
  return (
    <YStack gap="$3" alignItems="flex-start">
      <Menu>
        <Menu.Trigger asChild>
          <Button data-testid="menu-view">View</Button>
        </Menu.Trigger>
        <Menu.Content minWidth={220}>
          <Menu.Group>
            <Menu.Label>Show</Menu.Label>
            <Menu.CheckboxItem
              data-testid="menu-show-done"
              checked={showDone}
              onCheckedChange={(next) => setShowDone(next === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <Menu.ItemIndicator forceMount />
              Completed
            </Menu.CheckboxItem>
            <Menu.CheckboxItem
              checked={showArchived}
              onCheckedChange={(next) => setShowArchived(next === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <Menu.ItemIndicator forceMount />
              Archived
            </Menu.CheckboxItem>
          </Menu.Group>
          <Menu.Separator />
          <Menu.RadioGroup value={sort} onValueChange={setSort}>
            <Menu.Label>Sort by</Menu.Label>
            {(["created", "modified", "title"] as const).map((value) => (
              <Menu.RadioItem key={value} value={value} data-testid={`menu-sort-${value}`}>
                <Menu.ItemIndicator forceMount />
                {value[0].toUpperCase() + value.slice(1)}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu>
      <Paragraph size="$2" color="$color10" data-testid="menu-view-state">
        Showing {[showDone && "completed", showArchived && "archived"].filter(Boolean).join(" and ") || "nothing extra"}, sorted by {sort}.
      </Paragraph>
    </YStack>
  );
}

function ActionsMenu() {
  const [last, setLast] = useDemoState("menu.last", "");
  const act = (name: string) => () => setLast(name);
  return (
    <YStack gap="$3" alignItems="flex-start">
      <Menu placement="bottom-start">
        <Menu.Trigger asChild>
          <Button data-testid="menu-actions">Actions</Button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Arrow />
          <Menu.Item data-testid="menu-rename" onSelect={act("Rename")}>
            Rename
          </Menu.Item>
          <Menu.Item onSelect={act("Duplicate")}>Duplicate</Menu.Item>
          <Menu.Item onSelect={act("Move to…")}>Move to…</Menu.Item>
          <Menu.Separator />
          <Menu.Item disabled data-testid="menu-share">
            Share
          </Menu.Item>
          <Menu.Item theme="red" onSelect={act("Delete")} data-testid="menu-delete">
            Delete
          </Menu.Item>
        </Menu.Content>
      </Menu>
      <SizableText size="$2" color="$color10" data-testid="menu-actions-last">
        {last ? `Last action: ${last}` : "No action yet"}
      </SizableText>
    </YStack>
  );
}

export const MenuDemos: ComponentDemos = {
  name: "Menu",
  demos: [
    {
      title: "Actions",
      shot: { click: "menu-actions" },
      render: () => (
        <XStack paddingBottom={220}>
          <ActionsMenu />
        </XStack>
      ),
    },
    {
      title: "Checkbox and radio items",
      shot: { click: "menu-view" },
      render: () => (
        <XStack paddingBottom={300}>
          <ViewMenu />
        </XStack>
      ),
    },
    {
      title: "Placements",
      shot: { click: "menu-top" },
      render: () => (
        <XStack gap="$3" flexWrap="wrap" paddingVertical={150} justifyContent="center">
          {(["top", "bottom-start", "bottom-end", "right-start"] as const).map((placement) => (
            <Menu key={placement} placement={placement} loop>
              <Menu.Trigger asChild>
                <Button size="$3" data-testid={`menu-${placement}`}>
                  {placement}
                </Button>
              </Menu.Trigger>
              <Menu.Content>
                <Menu.Arrow />
                <Menu.Item>First</Menu.Item>
                <Menu.Item>Second</Menu.Item>
                <Menu.Item>Third</Menu.Item>
              </Menu.Content>
            </Menu>
          ))}
        </XStack>
      ),
    },
  ],
};
