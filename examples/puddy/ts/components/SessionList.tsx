import { h } from "@jam/types";
import { VStack, HStack, Text, Button, Circle, Divider, type Color } from "@jam/types";
import type { AgentSession } from "../models/session";
import { isTerminal } from "../models/session";

function statusColor(session: AgentSession): Color {
  switch (session.status.type) {
    case "starting": return "gray";
    case "active": return "blue";
    case "ended": return "secondary";
    case "failed": return "red";
  }
}

function sessionTitle(session: AgentSession): string {
  const firstMsg = session.messages.find(m => m.sender === "user");
  if (firstMsg && firstMsg.kind.type === "text") {
    const text = firstMsg.kind.text;
    return text.length > 60 ? text.slice(0, 60) + "…" : text;
  }
  return `Session ${session.id.slice(0, 8)}`;
}

function sessionSubtitle(session: AgentSession): string {
  if (session.status.type === "failed") return session.status.error;
  if (session.status.type === "ended") return `Ended: ${session.status.reason}`;
  if (session.streamingText) return "Responding...";
  return `${session.messages.length} messages`;
}

export function SessionRow({ session, onSelect }: {
  key?: string;
  session: AgentSession;
  onSelect: () => void;
}) {
  return (
    <Button key={session.id} label="" onPress={onSelect}>
      <HStack spacing={8}>
        <Circle foregroundColor={statusColor(session)} frame={8} />
        <VStack alignment="leading" spacing={2}>
          <Text font="body">{sessionTitle(session)}</Text>
          <Text font="caption" foregroundColor="secondary">{sessionSubtitle(session)}</Text>
        </VStack>
      </HStack>
    </Button>
  );
}

export function SessionListView({ sessions, onSelectSession, onNewSession }: {
  key?: string;
  sessions: AgentSession[];
  onSelectSession: (id: string) => void;
  onNewSession: (prompt: string) => void;
}) {
  return (
    <VStack key="session-list" alignment="leading" spacing={4}>
      <Text key="header" font="headline" padding={8}>Sessions</Text>
      <Divider key="divider-top" />
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onSelect={() => onSelectSession(session.id)}
        />
      ))}
      {sessions.length === 0 ? (
        <Text key="empty" font="body" foregroundColor="secondary" padding={16}>
          No sessions yet
        </Text>
      ) : null}
      <Divider key="divider-bottom" />
      <Button key="new-session" label="+ New Session" onPress={() => onNewSession("Hello!")} />
    </VStack>
  );
}
