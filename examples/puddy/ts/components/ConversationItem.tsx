import { h } from "@jam/types";
import { HStack, Text, type Color } from "@jam/types";
import type { ConversationItem, ConversationSender } from "../models/session";

function senderColor(sender: ConversationSender): Color {
  switch (sender) {
    case "user": return "blue";
    case "assistant": return "purple";
    case "tool": return "orange";
  }
}

function senderIcon(sender: ConversationSender): string {
  switch (sender) {
    case "user": return "👤";
    case "assistant": return "✨";
    case "tool": return "🔧";
  }
}

export function ConversationItemView({ item }: { key?: string; item: ConversationItem }) {
  const icon = senderIcon(item.sender);
  const color = senderColor(item.sender);

  switch (item.kind.type) {
    case "text":
      return (
        <HStack key={item.id} spacing={8}>
          <Text foregroundColor={color}>{icon}</Text>
          <Text font="body">{item.kind.text}</Text>
        </HStack>
      );

    case "toolUse":
      return (
        <HStack key={item.id} spacing={8}>
          <Text foregroundColor="orange">🔧</Text>
          <Text font="callout" foregroundColor="orange">{item.kind.name}</Text>
          {item.kind.status ? <Text font="caption" foregroundColor="secondary">{item.kind.status}</Text> : null}
        </HStack>
      );

    case "toolResult":
      const statusColor: Color = item.kind.status === "completed" ? "green" : "red";
      const statusIcon = item.kind.status === "completed" ? "✓" : "✗";
      return (
        <HStack key={item.id} spacing={8}>
          <Text foregroundColor={statusColor}>{statusIcon}</Text>
          {item.kind.title ? <Text font="caption">{item.kind.title}</Text> : null}
          <Text font="caption" foregroundColor={statusColor}>{item.kind.status}</Text>
        </HStack>
      );
  }
}
