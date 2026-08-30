import { navigate } from "../programs/router";

/** Click handler for an in-app `<a href>`: client-side navigation unless the user asked for a new tab. */
export function link(href: string): (event: MouseEvent) => void {
  return (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  };
}
