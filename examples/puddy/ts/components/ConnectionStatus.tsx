import { h, Fragment } from "@jam/types";
import { HStack, Text, Circle, Button, type Color } from "@jam/types";

export function ConnectionStatusBar({ isConnected, hostname, pingMs, error, onRetry }: {
  key?: string;
  isConnected: boolean;
  hostname: string;
  pingMs?: number;
  error?: string;
  onRetry: () => void;
}) {
  const dotColor: Color = isConnected ? "green" : error ? "red" : "orange";

  return (
    <HStack key="connection-status" spacing={8} padding={8}>
      <Circle foregroundColor={dotColor} frame={8} />
      <Text font="caption">
        {isConnected
          ? `${hostname}${pingMs != null ? ` (${pingMs}ms)` : ""}`
          : "Disconnected"}
      </Text>
      {error ? <Text key="error-text" font="caption" foregroundColor="red">{error}</Text> : null}
      {error ? <Button key="retry-btn" label="Retry" onPress={onRetry} font="caption" /> : null}
    </HStack>
  );
}
