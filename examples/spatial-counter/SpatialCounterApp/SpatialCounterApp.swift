import SwiftUI
import JamNative

@main
struct SpatialCounterApp: App {
    @State private var runtime = JamRuntime()

    var body: some Scene {
        WindowGroup {
            JamView(runtime: runtime)
                .frame(minWidth: 600, minHeight: 400)
                .padding(40)
                .onAppear { setup() }
        }
        #if os(visionOS)
        .windowStyle(.plain)
        .defaultSize(width: 700, height: 500)
        #endif
    }

    private func setup() {
        // Design system with a glassy visionOS-inspired palette
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: {
                    size: { "1": 8, "2": 16, "3": 24, "4": 32, "5": 48, "6": 64 },
                    space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 24, "6": 32, "7": 48, "8": 64 },
                    radius: { "1": 8, "2": 12, "3": 16, "4": 24, "5": 32 },
                    color: {
                        white: "#ffffff",
                        light: "#f0f0f5",
                        muted: "#8e8e93",
                        dark: "#1c1c1e",
                        accent: "#0a84ff",
                        accentLight: "#5ac8fa",
                        green: "#30d158",
                        red: "#ff453a",
                        orange: "#ff9f0a",
                        purple: "#bf5af2",
                        pink: "#ff375f",
                    },
                    zIndex: {},
                },
                themes: {
                    light: {
                        background: "#ffffff",
                        backgroundHover: "#f0f0f5",
                        color: "#1c1c1e",
                        borderColor: "#e0e0e5",
                    },
                },
                defaultTheme: "light",
            });

            // App state
            replace("counter", "count", 0);
            replace("app", "label", "Spatial Counter");
        """)

        // Register native action handler
        runtime.onNativeAction = { action, params in
            if action == "haptic" {
                let hapticType = (params?["type"] as? String) ?? "default"
                print("[SpatialCounter] Haptic: \(hapticType)")
            }
            return nil
        }

        // Mount the UI
        runtime.mountProgram(id: "app", source: """
            function Counter() {
                var matches = when(["counter", "count", $.count]);
                var count = matches.length > 0 ? matches[0].count : 0;

                var labelMatches = when(["app", "label", $.label]);
                var label = labelMatches.length > 0 ? labelMatches[0].label : "Counter";

                return h(YStack, {
                    gap: 32,
                    alignItems: "center",
                    padding: "$space.8",
                },
                    // Title
                    h(Text, {
                        fontSize: 28,
                        fontWeight: "300",
                        color: "$color.muted",
                        letterSpacing: 2,
                    }, label),

                    // Count display
                    h(YStack, {
                        alignItems: "center",
                        gap: 8,
                    },
                        h(Text, {
                            fontSize: 120,
                            fontWeight: "200",
                            color: count >= 0 ? "$color.accent" : "$color.red",
                        }, String(count)),

                        h(Text, {
                            fontSize: 14,
                            color: "$color.muted",
                        }, count === 1 ? "tap" : "taps")
                    ),

                    // Controls
                    h(XStack, { gap: 16 },
                        h(Button, {
                            id: "decrement",
                            padding: "$space.5",
                            paddingHorizontal: "$space.6",
                            backgroundColor: "$color.light",
                            borderRadius: "$radius.4",
                            onClick: function() {
                                replace("counter", "count", count - 1);
                                callNative("haptic", { type: "light" });
                            },
                        }, h(Text, { fontSize: 24, fontWeight: "500", color: "$color.dark" }, "−")),

                        h(Button, {
                            id: "reset",
                            padding: "$space.5",
                            paddingHorizontal: "$space.6",
                            backgroundColor: count === 0 ? "$color.light" : "$color.orange",
                            borderRadius: "$radius.4",
                            opacity: count === 0 ? 0.5 : 1,
                            onClick: function() {
                                if (count !== 0) {
                                    replace("counter", "count", 0);
                                    callNative("haptic", { type: "medium" });
                                }
                            },
                        }, h(Text, {
                            fontSize: 14,
                            fontWeight: "600",
                            color: count === 0 ? "$color.muted" : "$color.white",
                        }, "RESET")),

                        h(Button, {
                            id: "increment",
                            padding: "$space.5",
                            paddingHorizontal: "$space.6",
                            backgroundColor: "$color.accent",
                            borderRadius: "$radius.4",
                            onClick: function() {
                                replace("counter", "count", count + 1);
                                callNative("haptic", { type: "light" });
                            },
                        }, h(Text, { fontSize: 24, fontWeight: "500", color: "$color.white" }, "+"))
                    ),

                    // Color palette demo
                    h(XStack, { gap: 8, paddingTop: "$space.4" },
                        ["accent", "green", "purple", "pink", "orange", "red"].map(function(c) {
                            return h(Button, {
                                key: c,
                                id: "color-" + c,
                                width: 32,
                                height: 32,
                                borderRadius: 100000,
                                backgroundColor: "$color." + c,
                                onClick: function() {
                                    replace("app", "label", c.charAt(0).toUpperCase() + c.slice(1) + " Counter");
                                },
                            });
                        })
                    )
                );
            }

            h(Counter, {})
        """)
    }
}
