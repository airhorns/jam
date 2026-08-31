import { h } from "@jam/core/jsx";
import { Avatar as UIAvatar, SizableText } from "@jam/ui";

function hue(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function Avatar({ name, size = 22 }: { name?: unknown; size?: number }) {
  const label = typeof name === "string" && name ? name : "?";
  const initials = label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <UIAvatar size={size} circular title={label} aria-label={label} data-testid="avatar" data-user={label}>
      <UIAvatar.Fallback backgroundColor={`hsl(${hue(label)} 55% 48%)`}>
        <SizableText size="$1" fontSize={Math.round(size * 0.42)} fontWeight="700" color="#fff">
          {initials}
        </SizableText>
      </UIAvatar.Fallback>
    </UIAvatar>
  );
}
