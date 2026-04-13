import SwiftUI
import JamNative

@main
struct CounterApp: App {
    @State private var runtime = JamRuntime()

    var body: some Scene {
        WindowGroup {
            JamView(runtime: runtime)
                .frame(minWidth: 400, minHeight: 300)
                .onAppear {
                    // Set up the design system
                    runtime.loadProgram(id: "setup", source: """
                        createJamUI({
                            tokens: {
                                size: { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25 },
                                space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20 },
                                radius: { "1": 4, "2": 8, "3": 12 },
                                color: {
                                    bg: "#1a1a2e",
                                    text: "#e6e6e6",
                                    accent: "#0f3460",
                                    highlight: "#e94560",
                                },
                                zIndex: {},
                            },
                            themes: {
                                dark: {
                                    background: "#1a1a2e",
                                    color: "#e6e6e6",
                                    borderColor: "#16213e",
                                },
                            },
                            defaultTheme: "dark",
                        });
                    """)

                    // Mount the counter program
                    runtime.mountProgram(id: "counter", source: """
                        // Initialize counter state
                        replace("counter", "count", 0);

                        function Counter() {
                            const matches = when(["counter", "count", $.count]);
                            const count = matches.length > 0 ? matches[0].count : 0;

                            return h(YStack, {
                                padding: "$space.4",
                                gap: 24,
                                alignItems: "center",
                                backgroundColor: "$background",
                                flex: 1,
                            },
                                h(Text, {
                                    fontSize: 14,
                                    color: "$color.text",
                                }, "Jam + SwiftUI Counter"),

                                h(Text, {
                                    fontSize: 72,
                                    fontWeight: "700",
                                    color: "$color.highlight",
                                }, String(count)),

                                h(XStack, { gap: 16 },
                                    h(Button, {
                                        onClick: function() { replace("counter", "count", count - 1); },
                                        padding: "$space.3",
                                        backgroundColor: "$color.accent",
                                        borderRadius: "$radius.2",
                                    }, h(Text, { color: "$color.text", fontSize: 18 }, "- Decrement")),

                                    h(Button, {
                                        onClick: function() { replace("counter", "count", count + 1); },
                                        padding: "$space.3",
                                        backgroundColor: "$color.highlight",
                                        borderRadius: "$radius.2",
                                    }, h(Text, { color: "$color.text", fontSize: 18 }, "+ Increment"))
                                ),

                                h(Button, {
                                    onClick: function() { replace("counter", "count", 0); },
                                    padding: "$space.2",
                                },  h(Text, { color: "$color.text", fontSize: 14 }, "Reset"))
                            );
                        }

                        h(Counter, {})
                    """)
                }
        }
    }
}
