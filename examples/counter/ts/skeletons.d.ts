import { KnownSkeletons } from "./jam";

declare module "./jam" {
    interface KnownSkeletons {
        // Entity-attribute-value patterns for UI
        200: [string, "isa", string];
        201: [string, "text", string];
        202: [string, "font", string];
        203: [string, "foregroundColor", string];
        204: [string, "label", string];
        205: [string, "action", string];
        206: [string, "spacing", number];
        // Parent-child relationship
        207: [string, "child", string, string];
        // Counter state
        208: ["counter", "count", number];
    }
}
