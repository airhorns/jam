import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { closeMenus, isMenuOpen, toggleMenu } from "../programs/ui";
import { CheckIcon } from "./icons";

interface MenuProps {
  menu: string;
  class?: string;
  align?: "left" | "right";
  title?: string;
  trigger: VChild;
  children?: VChild;
}

/** A dropdown whose open state is the fact ["ui", "menu", "open", menu]; clicks inside `[data-menu]` don't close it. */
export function Menu({ menu, class: cls, align = "left", title, trigger, children }: MenuProps) {
  const open = isMenuOpen(menu);
  return (
    <div class={`menu ${cls ?? ""}`.trim()} data-menu={menu}>
      <button type="button" class={open ? "menu-trigger open" : "menu-trigger"} title={title} onClick={() => toggleMenu(menu)}>
        {trigger}
      </button>
      {open && <div class={`menu-dropdown align-${align}`}>{children}</div>}
    </div>
  );
}

interface MenuItemProps {
  selected?: boolean;
  keepOpen?: boolean;
  class?: string;
  onSelect: () => void;
  children?: VChild;
}

export function MenuItem({ selected, keepOpen, class: cls, onSelect, children }: MenuItemProps) {
  return (
    <button
      type="button"
      class={`menu-item ${selected ? "selected" : ""} ${cls ?? ""}`.trim()}
      onClick={() => {
        if (!keepOpen) closeMenus();
        onSelect();
      }}
    >
      <span class="menu-item-body">{children}</span>
      {selected && <CheckIcon />}
    </button>
  );
}

export function MenuHeading({ children }: { children?: VChild }) {
  return <div class="menu-heading">{children}</div>;
}
