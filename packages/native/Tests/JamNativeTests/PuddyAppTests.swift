import XCTest
@testable import JamNative

/// End-to-end tests for the Puddy app pattern — verifies that a multi-component
/// chat application works correctly through the JamNative bridge.
final class PuddyAppTests: XCTestCase {

    private func createPuddyRuntime() -> JamRuntime {
        let runtime = JamRuntime()

        // Design system setup (matches puddy-native's PuddyPrograms.designSystem)
        runtime.loadProgram(id: "design", source: """
            createJamUI({
                tokens: {
                    size: { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25 },
                    space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24 },
                    radius: { "1": 3, "2": 6, "3": 8 },
                    color: {
                        bg: "#0d1117", bgSidebar: "#010409", bgSurface: "#161b22",
                        bgInput: "#0d1117", border: "#21262d",
                        text: "#c9d1d9", textBright: "#e6edf3", textMuted: "#8b949e",
                        green: "#3fb950", orange: "#d29922", red: "#f85149",
                        blue: "#58a6ff", purple: "#bc8cff", gray: "#484f58",
                        btnBg: "#21262d", btnBorder: "#30363d",
                    },
                    zIndex: {},
                },
                themes: {
                    dark: {
                        background: "#0d1117", backgroundHover: "#161b22",
                        color: "#c9d1d9", borderColor: "#21262d",
                    },
                },
                defaultTheme: "dark",
            });
        """)

        // Initial state
        runtime.loadProgram(id: "init", source: """
            set("connection", "status", "disconnected");
            set("connection", "hostname", "localhost");
            set("ui", "selectedSession", "");
        """)

        return runtime
    }

    // MARK: - Component Rendering

    func testConnectionBarRendersDisconnected() throws {
        let runtime = createPuddyRuntime()

        runtime.mountProgram(id: "bar", source: """
            function ConnectionBar() {
                var matches = when(["connection", "status", $.status]);
                var status = matches.length > 0 ? matches[0].status : "unknown";
                var label = status === "connected" ? "Connected" : "Disconnected";
                return h(XStack, { gap: 8, padding: "$space.2" },
                    h(Text, { fontSize: 12 }, label)
                );
            }
            h(ConnectionBar, {})
        """)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Disconnected"))
    }

    func testConnectionBarReactsToStatusChange() throws {
        let runtime = createPuddyRuntime()

        runtime.mountProgram(id: "bar", source: """
            function ConnectionBar() {
                var matches = when(["connection", "status", $.status]);
                var status = matches.length > 0 ? matches[0].status : "unknown";
                var label = status === "connected" ? "Connected" : "Disconnected";
                return h(XStack, {},
                    h(Text, {}, label)
                );
            }
            h(ConnectionBar, {})
        """)

        XCTAssertTrue(runtime.getCurrentFacts().contains("Disconnected"))

        runtime.loadProgram(id: "connect", source: """
            set("connection", "status", "connected");
        """)

        XCTAssertTrue(runtime.getCurrentFacts().contains("Connected"))
    }

    func testSessionListShowsSessions() throws {
        let runtime = createPuddyRuntime()

        runtime.mountProgram(id: "list", source: """
            function SessionList() {
                var sessions = when(
                    ["session", $.sid, "agent", $.agent],
                    ["session", $.sid, "status", $.status]
                );
                return h(YStack, {},
                    h(Text, {}, "SESSIONS"),
                    sessions.map(function(s) {
                        return h(Text, { key: s.sid }, s.agent + " — " + s.sid + " [" + s.status + "]");
                    }),
                    h(Text, { id: "count" }, sessions.length + " sessions")
                );
            }
            h(SessionList, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("SESSIONS"))
        XCTAssertTrue(facts.contains("0 sessions"))

        // Add a session
        runtime.loadProgram(id: "add-s1", source: """
            assert("session", "s-1", "agent", "claude");
            assert("session", "s-1", "status", "active");
        """)

        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("claude"))
        XCTAssertTrue(facts.contains("s-1"))
        XCTAssertTrue(facts.contains("1 sessions"))

        // Add another session
        runtime.loadProgram(id: "add-s2", source: """
            assert("session", "s-2", "agent", "gpt-4");
            assert("session", "s-2", "status", "starting");
        """)

        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("gpt-4"))
        XCTAssertTrue(facts.contains("2 sessions"))
    }

    func testMessageListRendersMessages() throws {
        let runtime = createPuddyRuntime()

        // Select a session and add messages
        runtime.loadProgram(id: "state", source: """
            set("ui", "selectedSession", "s-1");
        """)

        runtime.mountProgram(id: "msgs", source: """
            function MessageList() {
                var sel = when(["ui", "selectedSession", $.id]);
                var selectedId = sel.length > 0 ? sel[0].id : "";
                var messages = when(["message", selectedId, $.msgId, $.sender, $.kind, $.content]);
                return h(YStack, {},
                    messages.map(function(m) {
                        var prefix = m.sender === "user" ? "USER" : "ASST";
                        return h(Text, { key: m.msgId }, prefix + ": " + m.content);
                    }),
                    h(Text, { id: "msg-count" }, messages.length + " messages")
                );
            }
            h(MessageList, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("0 messages"))

        // Add user message
        runtime.loadProgram(id: "msg1", source: """
            assert("message", "s-1", "m1", "user", "text", "Hello world");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("USER: Hello world"))
        XCTAssertTrue(facts.contains("1 messages"))

        // Add assistant message
        runtime.loadProgram(id: "msg2", source: """
            assert("message", "s-1", "m2", "assistant", "text", "Hi! How can I help?");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("ASST: Hi! How can I help?"))
        XCTAssertTrue(facts.contains("2 messages"))
    }

    // MARK: - Session State Management

    func testSessionStatusTransitions() throws {
        let runtime = createPuddyRuntime()

        // Create session in starting state
        runtime.loadProgram(id: "create", source: """
            assert("session", "s-1", "agent", "claude");
            assert("session", "s-1", "status", "starting");
        """)
        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("starting"))

        // Transition to active
        runtime.loadProgram(id: "activate", source: """
            retract("session", "s-1", "status", "starting");
            assert("session", "s-1", "status", "active");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("active"))
        XCTAssertFalse(facts.contains("starting"))

        // Transition to ended
        runtime.loadProgram(id: "end", source: """
            retract("session", "s-1", "status", "active");
            assert("session", "s-1", "status", "ended");
            assert("session", "s-1", "statusDetail", "end_turn");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("ended"))
        XCTAssertTrue(facts.contains("end_turn"))
    }

    func testStreamingTextAccumulation() throws {
        let runtime = createPuddyRuntime()

        runtime.loadProgram(id: "stream-setup", source: """
            assert("session", "s-1", "agent", "claude");
            assert("session", "s-1", "status", "active");
            set("ui", "selectedSession", "s-1");
        """)

        runtime.mountProgram(id: "stream-ui", source: """
            function StreamView() {
                var streaming = when(["session", "s-1", "streamingText", $.text]);
                var text = streaming.length > 0 ? streaming[0].text : "";
                return h(Text, { id: "stream" }, text ? "Streaming: " + text : "No stream");
            }
            h(StreamView, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("No stream"))

        // Simulate first chunk
        runtime.loadProgram(id: "chunk1", source: """
            assert("session", "s-1", "streamingText", "Hello ");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Streaming: Hello "))

        // Simulate second chunk (retract old, assert new)
        runtime.loadProgram(id: "chunk2", source: """
            retract("session", "s-1", "streamingText", "Hello ");
            assert("session", "s-1", "streamingText", "Hello world!");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Streaming: Hello world!"))

        // Finalize streaming → move to message
        runtime.loadProgram(id: "finalize", source: """
            var st = when(["session", "s-1", "streamingText", $.t]);
            if (st.length > 0) {
                retract("session", "s-1", "streamingText", st[0].t);
                assert("message", "s-1", "msg-final", "assistant", "text", st[0].t);
            }
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("No stream"), "StreamView should show no stream after finalize")
        XCTAssertTrue(facts.contains("Hello world!"), "Finalized message should exist as a message fact")
    }

    // MARK: - Tool Call Flow

    func testToolCallFlow() throws {
        let runtime = createPuddyRuntime()

        runtime.loadProgram(id: "setup", source: """
            set("ui", "selectedSession", "s-1");
            assert("session", "s-1", "agent", "claude");
            assert("session", "s-1", "status", "active");
        """)

        // Simulate tool call
        runtime.loadProgram(id: "tool1", source: """
            assert("message", "s-1", "tc-1", "assistant", "toolUse", "Read file: main.swift");
            assert("session", "s-1", "hasActiveTools", "true");
        """)
        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Read file: main.swift"))
        XCTAssertTrue(facts.contains("hasActiveTools"))

        // Tool completes
        runtime.loadProgram(id: "tool-done", source: """
            assert("message", "s-1", "tc-1-result", "tool", "toolResult", "completed");
            retract("session", "s-1", "hasActiveTools", "true");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("completed"))
    }

    // MARK: - Plan Rendering

    func testPlanEntries() throws {
        let runtime = createPuddyRuntime()

        runtime.loadProgram(id: "plan", source: """
            transaction(function() {
                assert("plan", "s-1", "entry-0", "Design the API", "completed", "high");
                assert("plan", "s-1", "entry-1", "Implement tests", "in_progress", "high");
                assert("plan", "s-1", "entry-2", "Deploy to prod", "pending", "medium");
            });
        """)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Design the API"))
        XCTAssertTrue(facts.contains("Implement tests"))
        XCTAssertTrue(facts.contains("Deploy to prod"))
        XCTAssertTrue(facts.contains("completed"))
        XCTAssertTrue(facts.contains("in_progress"))
    }

    // MARK: - Entity Tree Verification

    func testPuddyEntityTreeStructure() throws {
        let runtime = createPuddyRuntime()

        // Mount a simplified puddy layout
        runtime.mountProgram(id: "layout", source: """
            function App() {
                return h(XStack, { flex: 1 },
                    h(YStack, { width: 280, backgroundColor: "$color.bgSidebar" },
                        h(Text, { fontWeight: "600" }, "SESSIONS"),
                        h(Separator, {}),
                        h(Button, { id: "new-btn" }, h(Text, {}, "+ New Session"))
                    ),
                    h(YStack, { flex: 1, backgroundColor: "$color.bg" },
                        h(Text, { fontWeight: "600", fontSize: 15, id: "title" }, "Select a session"),
                        h(Separator, {})
                    )
                );
            }
            h(App, {})
        """)

        let facts = runtime.getCurrentFacts()

        // Verify component tags are emitted (native mode uses displayName)
        XCTAssertTrue(facts.contains("XStack"), "Should have XStack")
        XCTAssertTrue(facts.contains("YStack"), "Should have YStack")
        XCTAssertTrue(facts.contains("Separator"), "Should have Separator")
        XCTAssertTrue(facts.contains("Button"), "Should have Button")

        // Verify text content
        XCTAssertTrue(facts.contains("SESSIONS"))
        XCTAssertTrue(facts.contains("+ New Session"))
        XCTAssertTrue(facts.contains("Select a session"))

        // Verify style facts are present
        XCTAssertTrue(facts.contains("style"), "Should have style facts")
        XCTAssertTrue(facts.contains("#010409"), "bgSidebar color should be resolved")
        XCTAssertTrue(facts.contains("#0d1117"), "bg color should be resolved")
    }

    // MARK: - Session Selection and Detail View

    func testSessionSelectionChangesDetailView() throws {
        let runtime = createPuddyRuntime()

        runtime.loadProgram(id: "sessions", source: """
            assert("session", "s-1", "agent", "claude");
            assert("session", "s-1", "status", "active");
            assert("message", "s-1", "m1", "user", "text", "Hello from s-1");
            assert("session", "s-2", "agent", "gpt-4");
            assert("session", "s-2", "status", "active");
            assert("message", "s-2", "m1", "user", "text", "Hello from s-2");
        """)

        runtime.mountProgram(id: "detail", source: """
            function Detail() {
                var sel = when(["ui", "selectedSession", $.id]);
                var selectedId = sel.length > 0 ? sel[0].id : "";
                var messages = when(["message", selectedId, $.msgId, $.sender, $.kind, $.content]);
                return h(YStack, {},
                    h(Text, { id: "title" }, selectedId ? "Session: " + selectedId : "No selection"),
                    messages.map(function(m) {
                        return h(Text, { key: m.msgId }, m.content);
                    })
                );
            }
            h(Detail, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("No selection"))

        // Select s-1
        runtime.loadProgram(id: "select-1", source: """
            set("ui", "selectedSession", "s-1");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Session: s-1"))
        // The VDOM should contain s-1's message rendered as a Text node
        XCTAssertTrue(facts.contains("Hello from s-1"))

        // Switch to s-2
        runtime.loadProgram(id: "select-2", source: """
            set("ui", "selectedSession", "s-2");
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Session: s-2"))
        XCTAssertTrue(facts.contains("Hello from s-2"))
        // Note: "Hello from s-1" still exists as a raw message fact in the DB,
        // but the VDOM no longer renders it. getCurrentFacts() includes all facts,
        // so we can't assert it's missing. The important thing is s-2's content is present.
    }
}
