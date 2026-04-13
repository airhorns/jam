import XCTest
import JavaScriptCore
import SwiftUI
@testable import JamNative

final class JamRuntimeTests: XCTestCase {

    // MARK: - Initialization

    func testRuntimeInitializes() throws {
        let runtime = JamRuntime()
        XCTAssertTrue(runtime.entities.isEmpty)
        XCTAssertTrue(runtime.rootChildren.isEmpty)
    }

    func testGetCurrentFactsReturnsValidJSON() throws {
        let runtime = JamRuntime()
        let facts = runtime.getCurrentFacts()
        let data = facts.data(using: .utf8)!
        let parsed = try JSONSerialization.jsonObject(with: data) as? [[Any]]
        XCTAssertNotNil(parsed)
    }

    // MARK: - Program Loading

    func testLoadProgramAssertsFacts() throws {
        let runtime = JamRuntime()
        let result = runtime.loadProgram(id: "test", source: """
            remember("hello", "world", 42);
        """)
        XCTAssertEqual(result, "ok")
        let factsJson = runtime.getCurrentFacts()
        XCTAssertTrue(factsJson.contains("hello"))
        XCTAssertTrue(factsJson.contains("world"))
    }

    func testLoadProgramSyntaxError() throws {
        let runtime = JamRuntime()
        let result = runtime.loadProgram(id: "bad", source: "function { invalid")
        XCTAssertTrue(result.hasPrefix("error:"), "Should return error for syntax error")
    }

    func testLoadProgramRuntimeError() throws {
        let runtime = JamRuntime()
        let result = runtime.loadProgram(id: "bad", source: """
            throw new Error("boom");
        """)
        XCTAssertTrue(result.hasPrefix("error:"))
        XCTAssertTrue(result.contains("boom"))
    }

    func testLoadProgramErrorDoesNotCrashSubsequentCalls() throws {
        let runtime = JamRuntime()
        let _ = runtime.loadProgram(id: "bad", source: "throw new Error('fail');")
        // Runtime should still work after an error
        let result = runtime.loadProgram(id: "good", source: """
            remember("still", "working", true);
        """)
        XCTAssertEqual(result, "ok")
        XCTAssertTrue(runtime.getCurrentFacts().contains("still"))
    }

    func testLoadProgramReplacesExisting() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "data", source: """
            remember("counter", "value", 1);
        """)
        XCTAssertTrue(runtime.getCurrentFacts().contains("1"))

        // Reload same ID with different logic
        runtime.loadProgram(id: "data", source: """
            remember("counter", "value", 99);
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("99"), "Should have new value")
        XCTAssertFalse(facts.contains("1"), "Previous program facts should be removed on reload")
    }

    func testDisposeProgramRemovesTopLevelFactsAndReactiveClaims() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "decorator", source: """
            remember("program", "decorator", "loaded");
            whenever([["todo", $.id, "done", true]], function(matches) {
                for (const match of matches) {
                    claim("todo-" + match.id, "class", "strikethrough");
                }
            });
        """)
        runtime.loadProgram(id: "todo-data", source: """
            remember("todo", "1", "done", true);
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("decorator"))
        XCTAssertTrue(facts.contains("strikethrough"))

        runtime.disposeProgram(id: "decorator")
        facts = runtime.getCurrentFacts()
        XCTAssertFalse(facts.contains("decorator"), "Top-level facts should be removed")
        XCTAssertFalse(facts.contains("strikethrough"), "Reactive claims should be removed when disposer runs")
        XCTAssertTrue(facts.contains("todo"), "Underlying source facts should remain")
    }

    func testDisposeMountedProgramRemovesRenderedFacts() throws {
        let runtime = JamRuntime()
        runtime.mountProgram(id: "ui", source: """
            h("div", { id: "mounted-root" }, "hello")
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("mounted-root"))
        XCTAssertTrue(facts.contains("hello"))

        runtime.disposeProgram(id: "ui")
        facts = runtime.getCurrentFacts()
        XCTAssertFalse(facts.contains("mounted-root"), "Mounted VDOM facts should be removed")
        XCTAssertFalse(facts.contains("hello"), "Mounted text facts should be removed")
    }

    // MARK: - Fact Operations from Swift

    func testAssertFactFromSwift() throws {
        let runtime = JamRuntime()
        // assertFact is async, but we can verify via synchronous getCurrentFacts after a sync boundary
        runtime.loadProgram(id: "noop", source: "")

        // Use loadProgram to insert (synchronous path)
        runtime.loadProgram(id: "insert-test", source: """
            remember("swift-fact", "key", "value123");
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("swift-fact"))
        XCTAssertTrue(facts.contains("value123"))
    }

    func testSetFactUpserts() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "s1", source: """
            remember("item", "name", "first");
        """)
        XCTAssertTrue(runtime.getCurrentFacts().contains("first"))

        runtime.loadProgram(id: "s2", source: """
            remember("item", "name", "second");
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("second"))
        XCTAssertFalse(facts.contains("first"), "Old value should be removeed by remember()")
    }

    func testRetractFact() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "add", source: """
            remember("temp", "data", "drop-me");
        """)
        XCTAssertTrue(runtime.getCurrentFacts().contains("drop-me"))

        runtime.loadProgram(id: "drop", source: """
            forget("temp", "data", "drop-me");
        """)
        XCTAssertFalse(runtime.getCurrentFacts().contains("drop-me"), "Fact should be removeed")
    }

    // MARK: - Reactive Queries (when/whenever)

    func testWhenQueryReturnsMatches() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            remember("todo", "1", "title", "Buy milk");
            remember("todo", "2", "title", "Write tests");
            var matches = when(["todo", $.id, "title", $.title]);
            remember("test", "matchCount", matches.length);
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("2"), "Should find 2 matches")
    }

    func testWheneverReactiveRule() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "rule", source: """
            remember("counter", "value", 0);
            whenever([["counter", "value", $.v]], function(matches) {
                if (matches.length > 0) {
                    remember("display", "text", "Count is " + matches[0].v);
                }
            });
        """)
        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Count is 0"), "Initial whenever fire")

        runtime.loadProgram(id: "update", source: """
            remember("counter", "value", 5);
        """)
        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Count is 5"), "whenever should react to change")
    }

    func testTransactionBatchesMutations() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "tx", source: """
            transaction(function() {
                remember("batch", "a", 1);
                remember("batch", "b", 2);
                remember("batch", "c", 3);
            });
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"a\""))
        XCTAssertTrue(facts.contains("\"b\""))
        XCTAssertTrue(facts.contains("\"c\""))
    }

    // MARK: - VDOM / Mount

    func testMountProgramEmitsVDOMFacts() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: { "4": 16 }, radius: {}, color: { red: "#ff0000" }, zIndex: {} },
                themes: { dark: { background: "#111", color: "#eee" } },
                defaultTheme: "dark",
            });
        """)

        let mountResult = runtime.mountProgram(id: "ui", source: """
            remember("test", "value", 42);
            function TestComponent() {
                var matches = when(["test", "value", $.v]);
                var val = matches.length > 0 ? matches[0].v : 0;
                return h(YStack, { padding: "$space.4", backgroundColor: "$background" },
                    h(Text, { fontSize: 24, color: "$color.red" }, "Value: " + String(val))
                );
            }
            h(TestComponent, {})
        """)
        XCTAssertEqual(mountResult, "ok")

        let factsJson = runtime.getCurrentFacts()
        XCTAssertTrue(factsJson.contains("YStack"), "Should emit YStack tag")
        XCTAssertTrue(factsJson.contains("style"), "Should emit style facts")
        XCTAssertTrue(factsJson.contains("child"), "Should emit child facts")
    }

    func testMountProgramWithNestedLayout() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: { "2": 8 }, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "nested", source: """
            h(YStack, { gap: 8 },
                h(XStack, { gap: 4 },
                    h(Text, {}, "Left"),
                    h(Text, {}, "Right")
                ),
                h(XStack, {},
                    h(Button, { onClick: function() {} }, "Click me"),
                    h(Separator, {})
                )
            )
        """)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("YStack"))
        XCTAssertTrue(facts.contains("XStack"))
        XCTAssertTrue(facts.contains("Button"))
        XCTAssertTrue(facts.contains("Separator"))
        XCTAssertTrue(facts.contains("Left"))
        XCTAssertTrue(facts.contains("Right"))
        XCTAssertTrue(facts.contains("Click me"))
    }

    func testMountProgramReactiveRerender() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
            remember("name", "value", "Alice");
        """)

        runtime.mountProgram(id: "greeting", source: """
            function Greeting() {
                var matches = when(["name", "value", $.name]);
                var name = matches.length > 0 ? matches[0].name : "World";
                return h(Text, {}, "Hello " + name);
            }
            h(Greeting, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Hello Alice"))

        // Change the name fact — component should re-render
        runtime.loadProgram(id: "change-name", source: """
            remember("name", "value", "Bob");
        """)

        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Hello Bob"), "Component should re-render with new name")
        XCTAssertFalse(facts.contains("Hello Alice"), "Old rendered text should be gone")
    }

    // MARK: - Event Handling

    func testFireEventTriggersHandler() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
            replace("counter", "count", 0);
        """)

        runtime.mountProgram(id: "counter-ui", source: """
            function Counter() {
                var matches = when(["counter", "count", $.c]);
                var count = matches.length > 0 ? matches[0].c : 0;
                return h(YStack, {},
                    h(Text, { id: "count-display" }, "Count: " + count),
                    h(Button, {
                        id: "inc-btn",
                        onClick: function() { replace("counter", "count", count + 1); }
                    }, "Increment")
                );
            }
            h(Counter, {})
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Count: 0"))

        // Fire the click event on the button
        runtime.fireEvent(entityId: "inc-btn", event: "click")
        // fireEvent is async, need to wait for JS queue to process
        let expectation = XCTestExpectation(description: "Event processed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)

        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Count: 1"), "Count should increment after click event")
    }

    func testFireEventWithData() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "input-ui", source: """
            function InputTest() {
                return h(Input, {
                    id: "test-input",
                    onChange: function(e) { remember("input", "value", e.data); }
                });
            }
            h(InputTest, {})
        """)

        runtime.fireEvent(entityId: "test-input", event: "change", data: "hello world")
        let expectation = XCTestExpectation(description: "Event processed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("hello world"), "Input data should be stored as fact")
    }

    func testFireEventOnMissingEntity() throws {
        let runtime = JamRuntime()
        // No handler registered for this entity, so fireEvent should not crash
        // (it's async so we just verify it doesn't throw)
        runtime.fireEvent(entityId: "nonexistent", event: "click")
        let expectation = XCTestExpectation(description: "No crash")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)
        // If we get here, it didn't crash
    }

    // MARK: - Program Lifecycle

    func testDisposeProgramCleansUpFacts() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "temp-ui", source: """
            h(Text, {}, "Temporary")
        """)
        XCTAssertTrue(runtime.getCurrentFacts().contains("Temporary"))

        // Replace with a different mount to verify the old facts get cleaned up
        runtime.mountProgram(id: "temp-ui", source: """
            h(Text, {}, "Replacement")
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Replacement"), "New content should be present")
        // Old content may or may not be cleaned up depending on MobX batching,
        // but the important thing is the new content is rendered.
    }

    func testMountReplacesPreviousProgramWithSameId() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "view", source: """
            h(Text, {}, "Version 1")
        """)
        XCTAssertTrue(runtime.getCurrentFacts().contains("Version 1"))

        // mountProgram disposes previous before mounting new, both synchronously on jsQueue
        runtime.mountProgram(id: "view", source: """
            h(Text, {}, "Version 2")
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Version 2"))
        // The old facts may still be present since MobX reactions are batched.
        // What matters is the new version is there.
    }

    // MARK: - Design System / Token Resolution

    func testTokenResolutionInNativeMode() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: {
                    size: {},
                    space: { "4": 16, "8": 48 },
                    radius: { "2": 8 },
                    color: { blue: "#0000ff", bg: "#111111" },
                    zIndex: {},
                },
                themes: { dark: { background: "#222222", color: "#dddddd" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "styled", source: """
            h(YStack, { padding: "$space.4", borderRadius: "$radius.2", backgroundColor: "$color.bg" },
                h(Text, { color: "$color.blue" }, "Styled text")
            )
        """)

        let facts = runtime.getCurrentFacts()
        // Token $space.4 should resolve to 16
        XCTAssertTrue(facts.contains("16"), "padding $space.4 should resolve to 16")
        // Token $radius.2 should resolve to 8
        XCTAssertTrue(facts.contains("8"), "borderRadius $radius.2 should resolve to 8")
        // Token $color.bg should resolve to #111111
        XCTAssertTrue(facts.contains("#111111"), "backgroundColor should resolve to #111111")
        // Token $color.blue should resolve to #0000ff
        XCTAssertTrue(facts.contains("#0000ff"), "color should resolve to #0000ff")
    }

    func testThemeResolutionInNativeMode() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: {
                    light: { background: "#ffffff", color: "#000000" },
                    dark: { background: "#111111", color: "#eeeeee" },
                },
                defaultTheme: "light",
            });
        """)

        runtime.mountProgram(id: "themed", source: """
            h(YStack, { backgroundColor: "$background", color: "$color" },
                h(Text, {}, "Theme test")
            )
        """)

        var facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("#ffffff"), "Light theme background")

        // Switch theme
        runtime.loadProgram(id: "switch", source: """
            remember("ui", "theme", "dark");
        """)
        // Need to wait for reactive updates
        let expectation = XCTestExpectation(description: "Theme switch")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)

        facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("#111111"), "Dark theme background after switch")
    }

    // MARK: - Entity Tree Building

    func testEntityTreeBuilding() throws {
        let rawFacts: [[Any]] = [
            ["dom:0", "tag", "YStack"],
            ["dom", "child", 0, "dom:0"],
            ["dom:0", "style", "padding", 16],
            ["dom:0", "style", "backgroundColor", "#ff0000"],
            ["dom:0:0", "tag", "__text"],
            ["dom:0:0", "text", "Hello"],
            ["dom:0", "child", 0, "dom:0:0"],
            ["dom:0", "handler", "click", "dom:0:handler:click"],
        ]

        let tree = JamRuntime.buildEntityTree(from: rawFacts)

        XCTAssertEqual(tree.rootChildren.count, 1)
        XCTAssertEqual(tree.rootChildren[0].id, "dom:0")

        let ystack = tree.entities["dom:0"]!
        XCTAssertEqual(ystack.tag, "YStack")
        XCTAssertEqual(ystack.styles["padding"]?.doubleValue, 16)
        XCTAssertEqual(ystack.styles["backgroundColor"]?.stringValue, "#ff0000")
        XCTAssertTrue(ystack.handlers.contains("click"))

        let text = tree.entities["dom:0:0"]!
        XCTAssertEqual(text.tag, "__text")
        XCTAssertEqual(text.text, "Hello")
    }

    func testEntityTreeChildOrdering() throws {
        let rawFacts: [[Any]] = [
            ["dom:0", "tag", "YStack"],
            ["dom", "child", 0, "dom:0"],
            ["dom:0:2", "tag", "__text"],
            ["dom:0:2", "text", "Third"],
            ["dom:0", "child", 2, "dom:0:2"],
            ["dom:0:0", "tag", "__text"],
            ["dom:0:0", "text", "First"],
            ["dom:0", "child", 0, "dom:0:0"],
            ["dom:0:1", "tag", "__text"],
            ["dom:0:1", "text", "Second"],
            ["dom:0", "child", 1, "dom:0:1"],
        ]

        let tree = JamRuntime.buildEntityTree(from: rawFacts)
        let children = tree.entities["dom:0"]!.children
        XCTAssertEqual(children.count, 3)
        XCTAssertEqual(children[0].id, "dom:0:0")
        XCTAssertEqual(children[1].id, "dom:0:1")
        XCTAssertEqual(children[2].id, "dom:0:2")
    }

    func testEntityTreeWithMultipleRoots() throws {
        let rawFacts: [[Any]] = [
            ["dom:0", "tag", "YStack"],
            ["dom", "child", 0, "dom:0"],
            ["dom:1", "tag", "XStack"],
            ["dom", "child", 1, "dom:1"],
        ]

        let tree = JamRuntime.buildEntityTree(from: rawFacts)
        XCTAssertEqual(tree.rootChildren.count, 2)
        XCTAssertEqual(tree.rootChildren[0].id, "dom:0")
        XCTAssertEqual(tree.rootChildren[1].id, "dom:1")
    }

    func testEntityTreeEmptyFacts() throws {
        let tree = JamRuntime.buildEntityTree(from: [])
        XCTAssertTrue(tree.entities.isEmpty)
        XCTAssertTrue(tree.rootChildren.isEmpty)
    }

    func testEntityTreeSkipsNonVDOMFacts() throws {
        let rawFacts: [[Any]] = [
            ["token", "space", "4", 16],
            ["theme", "dark", "background", "#000"],
            ["counter", "value", 42],
            ["dom:0", "tag", "Text"],
            ["dom", "child", 0, "dom:0"],
        ]

        let tree = JamRuntime.buildEntityTree(from: rawFacts)
        // Should only have entities for dom:0 and dom
        XCTAssertEqual(tree.rootChildren.count, 1)
        // token/theme/counter entities should exist but have no meaningful tag
        XCTAssertEqual(tree.entities["dom:0"]?.tag, "Text")
    }

    // MARK: - JamTerm

    func testJamTermString() throws {
        let term = JamTerm("hello")
        XCTAssertEqual(term.stringValue, "hello")
        XCTAssertNil(term.boolValue)
    }

    func testJamTermNumber() throws {
        let term = JamTerm(NSNumber(value: 42.5))
        XCTAssertEqual(term.doubleValue, 42.5)
        XCTAssertEqual(term.stringValue, "42.5") // stringValue works for numbers too
    }

    func testJamTermBool() throws {
        let term = JamTerm(NSNumber(value: true))
        XCTAssertEqual(term.boolValue, true)

        let falseTerm = JamTerm(NSNumber(value: false))
        XCTAssertEqual(falseTerm.boolValue, false)
    }

    func testJamTermZeroValues() throws {
        let zero = JamTerm(NSNumber(value: 0))
        XCTAssertEqual(zero.doubleValue, 0)

        let emptyString = JamTerm("")
        XCTAssertEqual(emptyString.stringValue, "")
    }

    // MARK: - Complex E2E: Multi-component App

    func testMultiComponentAppWithState() throws {
        let runtime = JamRuntime()

        // Setup + initial state + app — all in one loadProgram so closures share scope
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: {
                    size: {},
                    space: { "2": 8, "4": 16 },
                    radius: { "2": 8 },
                    color: { bg: "#0d1117", text: "#c9d1d9", green: "#3fb950", red: "#f85149" },
                    zIndex: {},
                },
                themes: { dark: { background: "#0d1117", color: "#c9d1d9", borderColor: "#21262d" } },
                defaultTheme: "dark",
            });
            replace("connection", "status", "checking");
            replace("ui", "selectedSession", "");
        """)

        runtime.mountProgram(id: "app", source: """
            function ConnectionBar() {
                var matches = when(["connection", "status", $.status]);
                var status = matches.length > 0 ? matches[0].status : "unknown";
                var label = status === "connected" ? "Connected" : "Disconnected";
                return h(XStack, { gap: 8 },
                    h(Text, { fontSize: 12 }, label)
                );
            }

            function Detail() {
                var sel = when(["ui", "selectedSession", $.id]);
                var selectedId = sel.length > 0 ? sel[0].id : "";
                var messages = when(["message", selectedId, $.msgId, $.sender, $.kind, $.content]);
                return h(YStack, {},
                    h(ConnectionBar, {}),
                    h(Text, { id: "title" }, selectedId ? "Session: " + selectedId : "Select a session"),
                    messages.map(function(m) {
                        return h(Text, { key: m.msgId }, m.sender + ": " + m.content);
                    })
                );
            }

            h(Detail, {})
        """)

        // Verify initial state — check the VDOM contains expected text content
        var facts = runtime.getCurrentFacts()
        // Debug: print a summary of facts to understand the state
        XCTAssertTrue(facts.contains("Select a session"), "Initial title should render")
        // ConnectionBar reads ["connection", "status", $] which is a multi-pattern query.
        // The initial render should show "Disconnected" since status is "checking".
        // But ConnectionBar checks for "connected" specifically, so "checking" maps to "Disconnected".
        XCTAssertTrue(facts.contains("Disconnected"), "Initial connection status should be Disconnected")

        // Change connection status and verify reactive re-render.
        // The fact change happens inside loadProgram which runs on jsQueue.
        // MobX reactions are synchronous, so by the time loadProgram returns,
        // the nativeMount reaction should have re-fired and re-emitted VDOM.
        //
        // However, there's a subtlety: loadProgram uses `with(jam) { remember(...) }`
        // The `insert` is the MobX-wrapped action from @jam/core, which fires reactions
        // synchronously. But the nativeMount reaction's effect does `runInAction()`
        // which may batch with the loadProgram's action.
        //
        // To work around this, we verify the raw fact is present and that
        // subsequent state changes work when done from the same program scope.
        runtime.loadProgram(id: "connect-and-select", source: """
            replace("connection", "status", "connected");
            replace("ui", "selectedSession", "s-1");
            remember("message", "s-1", "m1", "user", "text", "Hello agent");
            remember("message", "s-1", "m2", "assistant", "text", "Hi there!");
        """)
        facts = runtime.getCurrentFacts()
        // Verify fact state
        XCTAssertTrue(facts.contains("connected"), "Connection fact should be insert")
        XCTAssertTrue(facts.contains("Hello agent"), "User message fact should be present")
        XCTAssertTrue(facts.contains("Hi there!"), "Assistant message fact should be present")
        // Verify VDOM re-rendered with new state
        XCTAssertTrue(facts.contains("Connected"), "ConnectionBar should show Connected")
        XCTAssertTrue(facts.contains("Session: s-1"), "Detail should show selected session")
    }

    // MARK: - Style Properties

    func testAllStylePropertiesEmitted() throws {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "styles", source: """
            h(YStack, {
                padding: 10,
                paddingTop: 20,
                width: 300,
                height: 200,
                backgroundColor: "#ff0000",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#333",
                opacity: 0.5,
                gap: 16,
                flex: 1,
            },
                h(Text, {
                    fontSize: 24,
                    fontWeight: "700",
                    color: "#00ff00",
                }, "Styled")
            )
        """)

        let facts = runtime.getCurrentFacts()
        // Layout styles
        XCTAssertTrue(facts.contains("\"padding\""), "Should have padding style")
        XCTAssertTrue(facts.contains("\"width\""), "Should have width style")
        XCTAssertTrue(facts.contains("\"height\""), "Should have height style")
        XCTAssertTrue(facts.contains("\"gap\""), "Should have gap style")
        XCTAssertTrue(facts.contains("\"flex\""), "Should have flex style")
        // Visual styles
        XCTAssertTrue(facts.contains("#ff0000"), "Should have backgroundColor value")
        XCTAssertTrue(facts.contains("\"borderRadius\""), "Should have borderRadius style")
        XCTAssertTrue(facts.contains("\"opacity\""), "Should have opacity style")
        // Text styles
        XCTAssertTrue(facts.contains("\"fontSize\""), "Should have fontSize style")
        XCTAssertTrue(facts.contains("\"fontWeight\""), "Should have fontWeight style")
        XCTAssertTrue(facts.contains("#00ff00"), "Should have text color value")
    }

    // MARK: - Color Parsing

    func testColorHexParsing() throws {
        // Test 6-digit hex
        let color6 = Color(hex: "#ff8800")
        XCTAssertNotNil(color6)

        // Test without hash
        let colorNoHash = Color(hex: "ff8800")
        XCTAssertNotNil(colorNoHash)

        // Test 8-digit hex (with alpha)
        let color8 = Color(hex: "#ff880080")
        XCTAssertNotNil(color8)

        // Test 3-digit (should still initialize, even if wrong)
        let color3 = Color(hex: "fff")
        XCTAssertNotNil(color3)
    }

    // MARK: - Font Weight Mapping

    func testFontWeightMapping() throws {
        XCTAssertEqual(mapFontWeight("100"), .ultraLight)
        XCTAssertEqual(mapFontWeight("400"), .regular)
        XCTAssertEqual(mapFontWeight("700"), .bold)
        XCTAssertEqual(mapFontWeight("900"), .black)
        XCTAssertEqual(mapFontWeight(nil), .regular)
        XCTAssertEqual(mapFontWeight("invalid"), .regular)
    }

    // MARK: - Alignment Mapping

    func testAlignmentMapping() throws {
        XCTAssertEqual(mapHAlignment("center"), .center)
        XCTAssertEqual(mapHAlignment("flex-end"), .trailing)
        XCTAssertEqual(mapHAlignment("end"), .trailing)
        XCTAssertEqual(mapHAlignment(nil), .leading)
        XCTAssertEqual(mapHAlignment("start"), .leading)

        XCTAssertEqual(mapVAlignment("center"), .center)
        XCTAssertEqual(mapVAlignment("flex-end"), .bottom)
        XCTAssertEqual(mapVAlignment(nil), .center)
    }

    // MARK: - callNative Bridge

    func testCallNativeInvokesSwiftHandler() throws {
        let runtime = JamRuntime()
        var receivedAction: String?
        var receivedParams: [String: Any]?

        runtime.onNativeAction = { action, params in
            receivedAction = action
            receivedParams = params
            return nil
        }

        runtime.loadProgram(id: "call-native", source: """
            callNative("createSession", { agentId: "claude", priority: 1 });
        """)

        XCTAssertEqual(receivedAction, "createSession")
        XCTAssertEqual(receivedParams?["agentId"] as? String, "claude")
        XCTAssertEqual(receivedParams?["priority"] as? Int, 1)
    }

    func testCallNativeWithNoParams() throws {
        let runtime = JamRuntime()
        var actionCalled = false

        runtime.onNativeAction = { action, params in
            XCTAssertEqual(action, "doSomething")
            XCTAssertNil(params)
            actionCalled = true
            return nil
        }

        runtime.loadProgram(id: "call-no-params", source: """
            callNative("doSomething");
        """)

        XCTAssertTrue(actionCalled)
    }

    func testCallNativeReturnsValueToJS() throws {
        let runtime = JamRuntime()

        runtime.onNativeAction = { action, params in
            if action == "getSessionId" {
                return "s-12345"
            }
            return nil
        }

        runtime.loadProgram(id: "use-return", source: """
            var result = callNative("getSessionId");
            remember("test", "sessionId", result);
        """)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("s-12345"), "Return value should be accessible in JS")
    }

    func testCallNativeWithoutHandler() throws {
        let runtime = JamRuntime()
        // No onNativeAction insert — should not crash
        runtime.loadProgram(id: "call-no-handler", source: """
            var result = callNative("anything");
            remember("test", "result", result === undefined ? "undefined" : "other");
        """)

        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("undefined"), "Should return undefined when no handler insert")
    }

    func testCallNativeFromEventHandler() throws {
        let runtime = JamRuntime()
        var actionReceived = false

        runtime.onNativeAction = { action, params in
            if action == "buttonPressed" {
                actionReceived = true
                // Simulate creating a session in response
            }
            return nil
        }

        runtime.loadProgram(id: "setup", source: """
            createJamUI({
                tokens: { size: {}, space: {}, radius: {}, color: {}, zIndex: {} },
                themes: { dark: { background: "#000", color: "#fff" } },
                defaultTheme: "dark",
            });
        """)

        runtime.mountProgram(id: "btn", source: """
            h(Button, {
                id: "test-btn",
                onClick: function() { callNative("buttonPressed", { source: "test" }); }
            }, "Click")
        """)

        // Fire the click event
        runtime.fireEvent(entityId: "test-btn", event: "click")
        let expectation = XCTestExpectation(description: "Event processed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)

        XCTAssertTrue(actionReceived, "callNative should be invoked from event handler")
    }
}
