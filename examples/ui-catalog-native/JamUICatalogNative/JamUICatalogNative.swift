import SwiftUI
import JamNative

@main
struct JamUICatalogNativeApp: App {
    @State private var runtime = JamRuntime()

    var body: some Scene {
        WindowGroup {
            JamView(runtime: runtime)
                .frame(minWidth: 760, minHeight: 640)
                .onAppear { setupCatalog() }
        }
    }

    private func setupCatalog() {
        runtime.loadProgram(id: "catalog-setup", source: """
            createJamUI({
                tokens: {
                    size: { "1": 8, "2": 16, "3": 24, "4": 32, "5": 48, "6": 64 },
                    space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 24, "6": 32, "7": 48 },
                    radius: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 24 },
                    color: {
                        background: "#f8fafc",
                        surface: "#ffffff",
                        text: "#172033",
                        muted: "#627083",
                        teal: "#007f73",
                        blue: "#2f6fcb",
                        amber: "#b45f06",
                        rose: "#b8325d",
                        border: "#d7dee8"
                    },
                    zIndex: { "1": 10, "2": 20 }
                },
                themes: {
                    light: {
                        background: "#f8fafc",
                        backgroundHover: "#edf2f7",
                        backgroundPress: "#e2e8f0",
                        backgroundFocus: "#2f6fcb",
                        color: "#172033",
                        borderColor: "#d7dee8",
                        borderColorHover: "#95a3b8",
                        borderColorFocus: "#2f6fcb",
                        outlineColor: "#2f6fcb"
                    }
                },
                defaultTheme: "light"
            });

            replace("catalog", "accepted", true);
            replace("catalog", "notifications", false);
            replace("catalog", "choice", "native");
            replace("catalog", "tab", "overview");
        """)

        runtime.mountProgram(id: "catalog", source: """
            function read(key, fallback) {
                var matches = when(["catalog", key, $.value]);
                return matches.length > 0 ? matches[0].value : fallback;
            }

            function Section(title, detail, body) {
                return h(Card, {
                    padding: "$space.5",
                    gap: 12,
                    backgroundColor: "$color.surface",
                    borderColor: "$color.border",
                    borderRadius: "$radius.3"
                },
                    h(Text, { fontSize: 18, fontWeight: "700", color: "$color.text" }, title),
                    h(Paragraph, { fontSize: 13, color: "$color.muted", lineHeight: 1.4 }, detail),
                    body
                );
            }

            function Swatch(color, label) {
                return h(YStack, { gap: 6, alignItems: "center" },
                    h(Circle, { width: 28, height: 28, backgroundColor: color }),
                    h(Text, { fontSize: 12, color: "$color.muted" }, label)
                );
            }

            function Catalog() {
                var accepted = read("accepted", true);
                var notifications = read("notifications", false);
                var choice = read("choice", "native");
                var tab = read("tab", "overview");
                var progress = notifications ? 82 : 48;

                return h(ScrollView, { flex: 1, backgroundColor: "$background" },
                    h(YStack, { padding: "$space.6", gap: 20, backgroundColor: "$background" },
                        h(YStack, { gap: 8 },
                            h(Text, { fontSize: 13, fontWeight: "700", color: "$color.teal", textTransform: "uppercase", letterSpacing: 1 }, "Jam UI native catalog"),
                            h(H1, { color: "$color.text" }, "@jam/ui component catalog"),
                            h(Paragraph, { color: "$color.muted", fontSize: 15, lineHeight: 1.5 },
                                "A native SwiftUI smoke app for the same Jam UI primitives used by the web catalog."
                            )
                        ),

                        Section("Foundations", "Theme tokens, text hierarchy, and shape primitives.",
                            h(YStack, { gap: 14 },
                                h(XStack, { gap: 12, flexWrap: "wrap" },
                                    Swatch("$color.teal", "teal"),
                                    Swatch("$color.blue", "blue"),
                                    Swatch("$color.amber", "amber"),
                                    Swatch("$color.rose", "rose")
                                ),
                                h(XStack, { gap: 14, alignItems: "center" },
                                    h(Square, { width: 42, height: 42, backgroundColor: "$color.teal", borderRadius: "$radius.2" }),
                                    h(Circle, { width: 42, height: 42, backgroundColor: "$color.blue" }),
                                    h(Square, { width: 34, height: 34, backgroundColor: "$color.amber", borderRadius: "$radius.4" })
                                )
                            )
                        ),

                        Section("Controls", "Buttons, inputs, switches, checkboxes, radios, and sliders.",
                            h(YStack, { gap: 16 },
                                h(XStack, { gap: 10, flexWrap: "wrap" },
                                    h(Button, { onClick: function() { replace("catalog", "tab", "overview"); } }, h(Text, {}, "Primary")),
                                    h(Button, { variant: "outlined", onClick: function() { replace("catalog", "tab", "native"); } }, h(Text, {}, "Outlined")),
                                    h(Button, { variant: "ghost" }, h(Text, {}, "Ghost"))
                                ),
                                h(YStack, { gap: 8 },
                                    h(Label, {}, "Name"),
                                    h(Input, { placeholder: "Ada Lovelace" }),
                                    h(TextArea, { placeholder: "Native review notes" })
                                ),
                                h(XStack, { gap: 12, alignItems: "center" },
                                    h(Checkbox, { checked: accepted, onCheckedChange: function(next) { replace("catalog", "accepted", next); } },
                                        h(Checkbox.Indicator, {}, h(Text, {}, "ok"))
                                    ),
                                    h(Text, {}, accepted ? "Accepted" : "Not accepted"),
                                    h(Switch, { checked: notifications, onCheckedChange: function(next) { replace("catalog", "notifications", next); } }),
                                    h(Text, {}, notifications ? "Notifications on" : "Notifications off")
                                ),
                                h(RadioGroup, { value: choice, orientation: "horizontal" },
                                    h(XStack, { gap: 10, alignItems: "center" },
                                        h(RadioGroup.Item, { value: "web", checked: choice === "web", onSelect: function() { replace("catalog", "choice", "web"); } },
                                            choice === "web" ? h(RadioGroup.Indicator, {}) : null
                                        ),
                                        h(Text, {}, "Web"),
                                        h(RadioGroup.Item, { value: "native", checked: choice === "native", onSelect: function() { replace("catalog", "choice", "native"); } },
                                            choice === "native" ? h(RadioGroup.Indicator, {}) : null
                                        ),
                                        h(Text, {}, "Native")
                                    )
                                ),
                                h(Slider, { value: [progress], min: 0, max: 100 })
                            )
                        ),

                        Section("Composition", "Tabs, progress, scroll containers, separators, and card sections.",
                            h(YStack, { gap: 14 },
                                h(Progress, { value: progress, max: 100 }),
                                h(Separator, {}),
                                h(Tabs, { value: tab },
                                    h(Tabs.List, {},
                                        h(Tabs.Tab, { onClick: function() { replace("catalog", "tab", "overview"); } }, h(Text, {}, "Overview")),
                                        h(Tabs.Tab, { onClick: function() { replace("catalog", "tab", "native"); } }, h(Text, {}, "Native"))
                                    ),
                                    h(Tabs.Content, {},
                                        h(Text, {}, tab === "native" ? "Native mode emits resolved style facts." : "Web mode injects CSS classes.")
                                    )
                                )
                            )
                        )
                    )
                );
            }

            h(Catalog, {})
        """)
    }
}
