import { h } from "@jam/core/jsx";
import { PriorityDisplay, PriorityValues, StatusDisplay, StatusValues, type PriorityValue, type StatusValue } from "../types";
import { PriorityIcon, StatusIcon } from "./icons";
import { Menu, MenuItem } from "./Menu";

interface PropertyMenuProps<T extends string> {
  menu: string;
  value?: unknown;
  showLabel?: boolean;
  align?: "left" | "right";
  onChange: (value: T) => void;
}

export function StatusMenu({ menu, value, showLabel, align, onChange }: PropertyMenuProps<StatusValue>) {
  const status = StatusValues.includes(value as StatusValue) ? (value as StatusValue) : "backlog";
  return (
    <Menu
      menu={menu}
      class="status-menu"
      align={align}
      title={StatusDisplay[status]}
      trigger={
        <span class="property-trigger">
          <StatusIcon status={status} />
          {showLabel && <span class="property-label">{StatusDisplay[status]}</span>}
        </span>
      }
    >
      {StatusValues.map((option) => (
        <MenuItem key={option} selected={option === status} onSelect={() => onChange(option)}>
          <StatusIcon status={option} />
          {StatusDisplay[option]}
        </MenuItem>
      ))}
    </Menu>
  );
}

export function PriorityMenu({ menu, value, showLabel, align, onChange }: PropertyMenuProps<PriorityValue>) {
  const priority = PriorityValues.includes(value as PriorityValue) ? (value as PriorityValue) : "none";
  return (
    <Menu
      menu={menu}
      class="priority-menu"
      align={align}
      title={PriorityDisplay[priority]}
      trigger={
        <span class="property-trigger">
          <PriorityIcon priority={priority} />
          {showLabel && <span class="property-label">{PriorityDisplay[priority]}</span>}
        </span>
      }
    >
      {PriorityValues.map((option) => (
        <MenuItem key={option} selected={option === priority} onSelect={() => onChange(option)}>
          <PriorityIcon priority={option} />
          {PriorityDisplay[option]}
        </MenuItem>
      ))}
    </Menu>
  );
}
