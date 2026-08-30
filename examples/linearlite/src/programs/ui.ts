// Transient UI state lives in facts too: which menu is open, whether the
// new-issue modal is showing. This program closes them on click-away / Escape.

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

function anyMenuOpen(): boolean {
  return when(["ui", "menu", "open", $.id]).length > 0;
}

export function startUi(): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target?.closest?.("[data-menu]")) return;
    if (anyMenuOpen()) closeMenus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (anyMenuOpen()) closeMenus();
    else forget("ui", "modal", _, _);
  };
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);

  // Confirmations and the search box text belong to the page they were opened on.
  const stopRoute = whenever([["route", "url", $.url]], ([match]) => {
    forget("ui", "confirm", _, _);
    if (match && parseRoute(String(match.url)).page !== "search") forget("ui", "search", _, _);
  });

  return () => {
    stopRoute();
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}
