/// JS source code for the Puddy app programs running inside JavaScriptCore.
/// The networking layer (fetch/SSE) is handled by Swift; these programs
/// handle design system setup, component rendering, and reactive state.
enum PuddyPrograms {

    static let designSystem = """
        createJamUI({
            tokens: {
                size: { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25, "6": 30, "7": 40, "8": 50 },
                space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "7": 32, "8": 48 },
                radius: { "1": 3, "2": 6, "3": 8, "4": 10, "5": 12, "6": 16 },
                color: {
                    bg: "#0d1117",
                    bgSidebar: "#010409",
                    bgSurface: "#161b22",
                    bgInput: "#0d1117",
                    border: "#21262d",
                    borderHover: "#484f58",
                    text: "#c9d1d9",
                    textBright: "#e6edf3",
                    textMuted: "#8b949e",
                    green: "#3fb950",
                    orange: "#d29922",
                    red: "#f85149",
                    blue: "#58a6ff",
                    purple: "#bc8cff",
                    gray: "#484f58",
                    btnBg: "#21262d",
                    btnBorder: "#30363d",
                },
                zIndex: { "1": 10, "2": 50, "3": 100 },
            },
            themes: {
                dark: {
                    background: "#0d1117",
                    backgroundHover: "#161b22",
                    backgroundPress: "#21262d",
                    color: "#c9d1d9",
                    colorHover: "#e6edf3",
                    borderColor: "#21262d",
                    borderColorHover: "#484f58",
                    borderColorFocus: "#58a6ff",
                    placeholderColor: "#484f58",
                },
            },
            defaultTheme: "dark",
        });
    """

    static let initialState = """
        set("connection", "status", "checking");
        set("connection", "hostname", "localhost");
        set("ui", "selectedSession", "");
    """

    /// The main component tree — renders the full puddy UI.
    /// Event handlers fire back to Swift via JamNative.fireEvent.
    /// State is managed entirely through the fact database.
    static let appComponent = """
        function ConnectionBar() {
            var matches = when(["connection", "status", $.status]);
            var status = matches.length > 0 ? matches[0].status : "unknown";
            var hostMatches = when(["connection", "hostname", $.host]);
            var host = hostMatches.length > 0 ? hostMatches[0].host : "";
            var dotColor = status === "connected" ? "$color.green"
                : status === "checking" ? "$color.orange" : "$color.red";
            var label = status === "connected" ? host
                : status === "checking" ? "Connecting..." : "Disconnected";
            return h(XStack, { gap: 8, padding: "$space.2", paddingHorizontal: "$space.6",
                backgroundColor: "$color.bgSidebar" },
                h(Text, { color: dotColor, fontSize: 8 }, "●"),
                h(Text, { fontSize: 12, color: "$color.textMuted" }, label)
            );
        }

        function SessionList() {
            var sessions = when(
                ["session", $.sid, "agent", $.agent],
                ["session", $.sid, "status", $.status]
            );
            var connection = when(["connection", "status", $.cstatus]);
            var isConnected = connection.length > 0 && connection[0].cstatus === "connected";

            return h(YStack, { width: 280, minWidth: 280, backgroundColor: "$color.bgSidebar" },
                h(Text, {
                    padding: "$space.4", paddingTop: "$space.5", paddingBottom: "$space.3",
                    fontWeight: "600", fontSize: 11, color: "$color.textMuted"
                }, "SESSIONS"),
                h(Separator, {}),
                h(YStack, { gap: 4, padding: "$space.2", flex: 1 },
                    sessions.map(function(s) {
                        var dotColor = s.status === "active" ? "$color.blue"
                            : s.status === "failed" ? "$color.red" : "$color.textMuted";
                        return h(Button, {
                            key: s.sid,
                            id: "session-" + s.sid,
                            padding: "$space.2",
                            onClick: function() { set("ui", "selectedSession", s.sid); }
                        },
                            h(XStack, { gap: 8, alignItems: "center" },
                                h(Text, { color: dotColor, fontSize: 8 }, "●"),
                                h(Text, { fontSize: 13, color: "$color.textBright", flex: 1 },
                                    s.agent + " — " + s.sid),
                                h(Text, { fontSize: 11, color: "$color.textMuted" }, s.status)
                            )
                        );
                    })
                ),
                h(XStack, { padding: "$space.4", borderTopWidth: 1, borderColor: "$color.border" },
                    h(Button, {
                        id: "new-session-btn",
                        width: "100%",
                        padding: "$space.2",
                        opacity: isConnected ? 1 : 0.4,
                        onClick: function() {
                            if (!isConnected) return;
                            // Call Swift directly — no polling needed
                            callNative("createSession");
                        }
                    }, h(Text, { fontSize: 13 }, "+ New Session"))
                )
            );
        }

        function MessageList() {
            var sel = when(["ui", "selectedSession", $.id]);
            var selectedId = sel.length > 0 ? sel[0].id : "";
            if (!selectedId) return null;

            var messages = when(["message", selectedId, $.msgId, $.sender, $.kind, $.content]);

            return h(YStack, { gap: 4, padding: "$space.5", paddingHorizontal: "$space.6" },
                messages.map(function(m) {
                    var icon, color;
                    if (m.kind === "thought") {
                        icon = "..."; color = "$color.textMuted";
                    } else if (m.kind === "toolUse") {
                        icon = "~"; color = "$color.orange";
                    } else if (m.kind === "toolResult") {
                        icon = m.content === "completed" ? "+" : "x";
                        color = m.content === "completed" ? "$color.green" : "$color.red";
                    } else if (m.sender === "user") {
                        icon = ">"; color = "$color.blue";
                    } else if (m.sender === "assistant") {
                        icon = "<"; color = "$color.purple";
                    } else {
                        icon = "#"; color = "$color.orange";
                    }
                    return h(XStack, { key: m.msgId, gap: 12, alignItems: "baseline" },
                        h(Text, { color: color, fontWeight: "700", fontSize: 13 }, icon),
                        h(Text, { fontSize: 13, color: "$color.text" }, m.content)
                    );
                })
            );
        }

        function StreamingIndicators() {
            var sel = when(["ui", "selectedSession", $.id]);
            var selectedId = sel.length > 0 ? sel[0].id : "";
            if (!selectedId) return null;

            var thinking = when(["session", selectedId, "thinking", $.val]);
            var isThinking = thinking.length > 0 && thinking[0].val === "true";

            var streaming = when(["session", selectedId, "streamingText", $.text]);
            var streamText = streaming.length > 0 ? streaming[0].text : "";

            return h(YStack, {},
                isThinking ? h(XStack, { gap: 8, padding: "$space.3",
                    paddingHorizontal: "$space.6", backgroundColor: "$color.bgSurface" },
                    h(Spinner, {}),
                    h(Text, { fontSize: 12, color: "$color.textMuted" }, "Thinking...")
                ) : null,
                streamText ? h(XStack, { gap: 8, padding: "$space.3",
                    paddingHorizontal: "$space.6", backgroundColor: "$color.bgSurface" },
                    h(Text, { color: "$color.purple", fontWeight: "700" }, "<"),
                    h(Text, { fontSize: 13, color: "$color.textMuted" }, streamText)
                ) : null
            );
        }

        function SessionDetail() {
            var sel = when(["ui", "selectedSession", $.id]);
            var selectedId = sel.length > 0 ? sel[0].id : "";

            return h(YStack, { flex: 1, backgroundColor: "$color.bg" },
                h(ConnectionBar, {}),
                h(Separator, {}),
                h(XStack, { gap: 8, padding: "$space.4", paddingHorizontal: "$space.6",
                    borderBottomWidth: 1, borderColor: "$color.border" },
                    h(Text, { fontWeight: "600", fontSize: 15, color: "$color.textBright",
                        id: "detail-title" },
                        selectedId ? "Session: " + selectedId : "Select a session"
                    )
                ),
                h(ScrollView, { flex: 1 },
                    h(MessageList, {})
                ),
                h(StreamingIndicators, {}),
                selectedId ? h(YStack, {},
                    h(Separator, {}),
                    h(XStack, { gap: 8, padding: "$space.4", paddingHorizontal: "$space.6",
                        backgroundColor: "$color.bgSidebar" },
                        h(Input, {
                            id: "message-input",
                            flex: 1,
                            placeholder: "Type a message...",
                            backgroundColor: "$color.bgInput",
                            borderColor: "$color.btnBorder",
                            color: "$color.text",
                            onKeyDown: function(e) {
                                if (e.key === "Enter") {
                                    var text = e.target.value.trim();
                                    if (text) {
                                        callNative("sendMessage", { sessionId: selectedId, text: text });
                                        e.target.value = "";
                                    }
                                }
                            }
                        })
                    )
                ) : null
            );
        }

        function App() {
            return h(XStack, { flex: 1 },
                h(SessionList, {}),
                h(SessionDetail, {})
            );
        }

        h(App, {})
    """
}
