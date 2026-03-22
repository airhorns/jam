import { KnownSkeletons } from "./jam";

declare module "./jam" {
    interface KnownSkeletons {
        // Connection state
        300: ["connection", "status", string];
        301: ["connection", "hostname", string];
        302: ["connection", "error", string];

        // Session state
        310: ["session", string, "agent", string];
        311: ["session", string, "status", string];
        312: ["session", string, "statusDetail", string];
        313: ["session", string, "streamingText", string];

        // Messages (6-term)
        320: ["message", string, string, string, string, string];

        // UI state
        330: ["ui", "selectedSession", string];

        // Items (for tests)
        340: ["item", string];
    }
}
