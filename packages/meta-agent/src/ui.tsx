import { $, when } from "@jam/core";
import { h } from "@jam/core/jsx";
import { Button, Input, Separator, Text, XStack, YStack, styled } from "@jam/ui";
import type { MetaAgent } from "./types";

const MonoText = styled(Text, {
  name: "MetaAgentMonoText",
  defaultProps: {
    fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.55,
  },
});

function messagesFor(agentId: string) {
  return when(
    ["metaAgentMessage", agentId, $.messageId, "role", $.role],
    ["metaAgentMessage", agentId, $.messageId, "text", $.text],
    ["metaAgentMessage", agentId, $.messageId, "createdAt", $.createdAt],
  ).sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
}

function statusFor(agentId: string): string {
  const status = when(["metaAgent", agentId, "status", $.status]);
  return (status[0]?.status as string | undefined) ?? "idle";
}

function submitPrompt(agent: MetaAgent, inputId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const prompt = input?.value.trim() ?? "";
  if (!prompt) return;
  if (input) input.value = "";
  agent.runPrompt(prompt);
}

export function MetaAgentPanel(props: {
  agent: MetaAgent;
  title?: string;
  width?: number;
}) {
  const { agent, title = "Meta Agent", width = 360 } = props;
  const status = statusFor(agent.id);
  const messages = messagesFor(agent.id);
  const inputId = `${agent.id}-prompt`;
  const files = when(["jamProgramFile", $.path, "size", $.size]);

  return (
    <YStack
      width={width}
      minWidth={width}
      height="100vh"
      backgroundColor="$color.bgSidebar"
      borderLeftWidth={1}
      borderColor="$color.border"
      data-testid="meta-agent-panel"
    >
      <XStack
        padding="$space.4"
        paddingHorizontal="$space.5"
        justifyContent="space-between"
        alignItems="center"
      >
        <YStack gap="$space.1">
          <Text fontWeight="700" fontSize={14} color="$color.textBright">
            {title}
          </Text>
          <Text fontSize={12} color={status === "failed" ? "$color.red" : "$color.textMuted"}>
            {status}
          </Text>
        </YStack>
        <Text fontSize={12} color="$color.blue">
          browser
        </Text>
      </XStack>
      <Separator />

      <YStack padding="$space.4" gap="$space.2" borderBottomWidth={1} borderColor="$color.border">
        <Text fontSize={11} color="$color.textMuted" textTransform="uppercase" letterSpacing={1.2}>
          Program files
        </Text>
        {files.length === 0 ? (
          <Text fontSize={12} color="$color.textMuted">No browser files yet</Text>
        ) : (
          files.map(({ path, size }) => (
            <XStack key={path as string} justifyContent="space-between" gap="$space.2">
              <MonoText color="$color.textBright" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {path as string}
              </MonoText>
              <MonoText color="$color.textMuted" flexShrink={0}>
                {`${size}b`}
              </MonoText>
            </XStack>
          ))
        )}
      </YStack>

      <YStack flex={1} overflow="auto" padding="$space.4" gap="$space.3" data-testid="meta-agent-transcript">
        {messages.length === 0 ? (
          <Text fontSize={13} color="$color.textMuted">
            No transcript yet
          </Text>
        ) : (
          messages.map(({ messageId, role, text }) => {
            const color =
              role === "user"
                ? "$color.blue"
                : role === "assistant"
                  ? "$color.purple"
                  : "$color.orange";
            return (
              <YStack key={messageId as string} gap="$space.1">
                <Text fontSize={11} color={color} textTransform="uppercase">
                  {role as string}
                </Text>
                <MonoText color="$color.text" whiteSpace="pre-wrap">
                  {text as string}
                </MonoText>
              </YStack>
            );
          })
        )}
      </YStack>

      <Separator />
      <XStack gap="$space.2" padding="$space.4" backgroundColor="$color.bgSidebar">
        <Input
          id={inputId}
          size="3"
          flex={1}
          placeholder="Message meta agent..."
          backgroundColor="$color.bgInput"
          borderColor="$color.btnBorder"
          color="$color.text"
          data-testid="meta-agent-input"
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter") submitPrompt(agent, inputId);
          }}
        />
        <Button
          size="3"
          data-testid="meta-agent-send"
          disabled={status === "running"}
          onClick={() => submitPrompt(agent, inputId)}
        >
          Run
        </Button>
      </XStack>
    </YStack>
  );
}
