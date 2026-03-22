import { h } from "../jam";
import { VStack, HStack, Text, ScrollView, TextField, Button, ProgressView, Divider } from "../components";
import type { AgentSession } from "../models/session";
import { isTerminal } from "../models/session";
import { ConversationItemView } from "./ConversationItem";

export function SessionDetailView({ session, onSendMessage, onDestroySession }: {
  session: AgentSession;
  onSendMessage: (text: string) => void;
  onDestroySession: () => void;
}) {
  return (
    <VStack key="detail" spacing={0}>
      {/* Header */}
      <HStack key="header" spacing={8} padding={12}>
        <Text font="headline">
          {session.agent} — {session.id.slice(0, 8)}
        </Text>
        <Text font="caption" foregroundColor="secondary">
          {session.status.type}
        </Text>
        {!isTerminal(session.status) ? (
          <Button key="end-btn" label="End Session" onPress={onDestroySession} foregroundColor="red" />
        ) : null}
      </HStack>

      <Divider key="header-divider" />

      {/* Messages */}
      <ScrollView key="messages" padding={12}>
        <VStack key="messages-list" alignment="leading" spacing={8}>
          {session.messages.map((msg) => (
            <ConversationItemView key={msg.id} item={msg} />
          ))}

          {/* Streaming text indicator */}
          {session.streamingText ? (
            <HStack key="streaming" spacing={8}>
              <Text foregroundColor="purple">✨</Text>
              <Text font="body" foregroundColor="secondary">{session.streamingText}</Text>
            </HStack>
          ) : null}

          {/* Status messages */}
          {session.status.type === "failed" ? (
            <Text key="error" font="body" foregroundColor="red">
              Error: {session.status.error}
            </Text>
          ) : null}
        </VStack>
      </ScrollView>

      <Divider key="input-divider" />

      {/* Input bar */}
      {!isTerminal(session.status) ? (
        <HStack key="input-bar" spacing={8} padding={12}>
          <TextField key="input" placeholder="Type a message..." onSubmit={onSendMessage} font="body" />
        </HStack>
      ) : null}

      {/* Token usage */}
      {session.tokenUsage ? (
        <HStack key="usage" spacing={12} padding={8}>
          {session.tokenUsage.costAmount != null ? (
            <Text key="cost" font="caption" foregroundColor="secondary">
              ${session.tokenUsage.costAmount.toFixed(4)} {session.tokenUsage.costCurrency ?? ""}
            </Text>
          ) : null}
          <Text key="tokens" font="caption" foregroundColor="secondary">
            {session.tokenUsage.contextUsed}/{session.tokenUsage.contextSize} tokens
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
}

export function NoSessionSelected() {
  return (
    <VStack key="no-session">
      <Text font="title2" foregroundColor="secondary">Select a session</Text>
    </VStack>
  );
}
