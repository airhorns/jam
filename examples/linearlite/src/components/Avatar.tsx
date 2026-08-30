import { h } from "@jam/core/jsx";

function hue(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function Avatar({ name }: { name?: unknown }) {
  const label = typeof name === "string" && name ? name : "?";
  const initials = label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span class="avatar" title={label} style={`background: hsl(${hue(label)} 55% 48%)`}>
      {initials}
    </span>
  );
}
