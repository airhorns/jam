import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { Button, Menu, SizableText } from "@jam/ui";
import { closeMenus, isMenuOpen, openMenu } from "../programs/ui";
import { PriorityDisplay, PriorityValues, StatusDisplay, StatusValues, type PriorityValue, type StatusValue } from "../types";
import { PriorityIcon, StatusIcon } from "./icons";

interface PropertyMenuProps<T extends string> {
  menu: string;
  value?: unknown;
  showLabel?: boolean;
  bordered?: boolean;
  onChange: (value: T) => void;
}

interface PropertyMenuConfig<T extends string> {
  kind: string;
  options: T[];
  display: Record<T, string>;
  fallback: T;
  icon: (value: T) => VChild;
}

/**
 * A single-choice property picker. The open state stays in the app's
 * `["ui","menu","open",id]` fact so `programs/ui` keeps owning "only one menu
 * at a time"; `data-menu` on the trigger and the portalled content is what
 * lets that program's click-away guard still recognise a click as "inside".
 */
function PropertyMenu<T extends string>(config: PropertyMenuConfig<T>, { menu, value, showLabel, bordered, onChange }: PropertyMenuProps<T>) {
  const current = config.options.includes(value as T) ? (value as T) : config.fallback;
  return (
    <Menu open={isMenuOpen(menu)} onOpenChange={(next) => (next ? openMenu(menu) : closeMenus())}>
      <Menu.Trigger asChild>
        <Button
          size="$2"
          chromeless={!bordered}
          variant={bordered ? "outlined" : undefined}
          paddingHorizontal="$2"
          gap="$2"
          data-menu={menu}
          data-testid={`${config.kind}-menu-trigger`}
          aria-label={`${config.kind}: ${config.display[current]}`}
          title={config.display[current]}
        >
          {config.icon(current)}
          {showLabel && <SizableText size="$2">{config.display[current]}</SizableText>}
        </Button>
      </Menu.Trigger>
      <Menu.Content data-menu={menu} data-testid="menu-content" minWidth={200}>
        <Menu.RadioGroup value={current} onValueChange={(next) => onChange(next as T)}>
          <Menu.Label>{config.kind === "status" ? "Status" : "Priority"}</Menu.Label>
          {config.options.map((option) => (
            <Menu.RadioItem key={option} value={option} size="$2" data-testid="menu-item" data-value={option}>
              <Menu.ItemIndicator forceMount />
              {config.icon(option)}
              <SizableText size="$2" flexGrow={1}>
                {config.display[option]}
              </SizableText>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu>
  );
}

const STATUS_CONFIG: PropertyMenuConfig<StatusValue> = {
  kind: "status",
  options: StatusValues,
  display: StatusDisplay,
  fallback: "backlog",
  icon: (status) => <StatusIcon status={status} />,
};

const PRIORITY_CONFIG: PropertyMenuConfig<PriorityValue> = {
  kind: "priority",
  options: PriorityValues,
  display: PriorityDisplay,
  fallback: "none",
  icon: (priority) => <PriorityIcon priority={priority} />,
};

export function StatusMenu(props: PropertyMenuProps<StatusValue>) {
  return PropertyMenu(STATUS_CONFIG, props);
}

export function PriorityMenu(props: PropertyMenuProps<PriorityValue>) {
  return PropertyMenu(PRIORITY_CONFIG, props);
}
