/**
 * Whether a click on a link should navigate in-app. Modifier and middle clicks
 * are left to the browser so a real `href` can still open in a new tab.
 */
export function isPlainClick(event: Event): boolean {
  const mouse = event as MouseEvent;
  return (mouse.button ?? 0) === 0 && !mouse.metaKey && !mouse.ctrlKey && !mouse.shiftKey && !mouse.altKey;
}
