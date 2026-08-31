// Transient UI state lives in facts too: which menu is open, whether the
// new-issue modal is showing. Escape and click-away are handled by the @jam/ui
// overlays themselves, which report back through onOpenChange.

import { $, _, forget, replace, when, whenever } from "@jam/core";
import { parseRoute } from "./router";

export function openMenu(id: string): void {
  replace("ui", "menu", "open", id);
}

export function closeMenus(): void {
  forget("ui", "menu", "open", _);
}

export function toggleMenu(id: string): void {
  if (isMenuOpen(id)) closeMenus();
  else openMenu(id);
}

export function isMenuOpen(id: string): boolean {
  return when(["ui", "menu", "open", id]).length > 0;
}

export function openModal(name: string): void {
  replace("ui", "modal", name, true);
}

export function closeModal(name: string): void {
  forget("ui", "modal", name, _);
}

export function isModalOpen(name: string): boolean {
  return when(["ui", "modal", name, true]).length > 0;
}

/** Confirmations and the search box text belong to the page they were opened on. */
export function startUi(): () => void {
  return whenever([["route", "url", $.url]], ([match]) => {
    forget("ui", "confirm", _, _);
    if (match && parseRoute(String(match.url)).page !== "search") forget("ui", "search", _, _);
  });
}
