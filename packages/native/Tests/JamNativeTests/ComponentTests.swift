import XCTest
import SwiftUI
@testable import JamNative

/// Tests for the expanded component library — verifies that all @jam/ui components
/// render correctly through the JamNative bridge and produce expected VDOM facts.
final class ComponentTests: XCTestCase {

    private func setupRuntime() -> JamRuntime {
        let runtime = JamRuntime()
        runtime.loadProgram(id: "design", source: """
            createJamUI({
                tokens: {
                    size: { "1": 8, "2": 16, "3": 24, "4": 32 },
                    space: { "1": 4, "2": 8, "3": 12, "4": 16 },
                    radius: { "1": 4, "2": 8, "3": 12 },
                    color: {
                        bg: "#0d1117", text: "#c9d1d9", blue: "#58a6ff",
                        red: "#f85149", green: "#3fb950", gray: "#8b949e",
                    },
                    zIndex: { "1": 10 },
                },
                themes: {
                    dark: { background: "#0d1117", color: "#c9d1d9", borderColor: "#21262d" },
                },
                defaultTheme: "dark",
            });
        """)
        return runtime
    }

    // MARK: - Layout Components

    func testStackVariants() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "stacks", source: """
            h(YStack, { gap: 8, padding: "$space.4" },
                h(XStack, { gap: 4 },
                    h(Text, {}, "Left"),
                    h(Text, {}, "Right")
                ),
                h(ZStack, {},
                    h(Text, {}, "Bottom"),
                    h(Text, {}, "Top")
                )
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("YStack"))
        XCTAssertTrue(facts.contains("XStack"))
        XCTAssertTrue(facts.contains("ZStack"))
    }

    func testGroupComponents() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "groups", source: """
            h(YStack, {},
                h(XGroup, { gap: 8 },
                    h(Button, {}, h(Text, {}, "A")),
                    h(Button, {}, h(Text, {}, "B"))
                ),
                h(YGroup, { gap: 4 },
                    h(Text, {}, "One"),
                    h(Text, {}, "Two")
                )
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("XGroup"))
        XCTAssertTrue(facts.contains("YGroup"))
    }

    // MARK: - Typography

    func testHeadingVariants() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "headings", source: """
            h(YStack, {},
                h(H1, {}, "Heading 1"),
                h(H2, {}, "Heading 2"),
                h(H3, {}, "Heading 3"),
                h(H4, {}, "Heading 4"),
                h(H5, {}, "Heading 5"),
                h(H6, {}, "Heading 6")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("H1"))
        XCTAssertTrue(facts.contains("H2"))
        XCTAssertTrue(facts.contains("H3"))
        XCTAssertTrue(facts.contains("Heading 1"))
        XCTAssertTrue(facts.contains("Heading 6"))
    }

    func testTextWithStyling() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "styled-text", source: """
            h(Text, {
                fontSize: 18,
                fontWeight: "700",
                color: "$color.blue",
                letterSpacing: 1.5,
                textTransform: "uppercase",
            }, "styled text")
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("styled text"))
        XCTAssertTrue(facts.contains("18"), "fontSize should be 18")
        XCTAssertTrue(facts.contains("700"), "fontWeight should be 700")
        XCTAssertTrue(facts.contains("#58a6ff"), "color token should resolve")
        XCTAssertTrue(facts.contains("uppercase"), "textTransform should be present")
        XCTAssertTrue(facts.contains("1.5"), "letterSpacing should be present")
    }

    func testParagraph() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "para", source: """
            h(Paragraph, { fontSize: 14 }, "A paragraph of text.")
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Paragraph"))
        XCTAssertTrue(facts.contains("A paragraph of text."))
    }

    // MARK: - Shapes

    func testSquare() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "square", source: """
            h(Square, { width: 50, height: 50, backgroundColor: "$color.blue" })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Square"))
        XCTAssertTrue(facts.contains("50"), "Size should be 50")
        XCTAssertTrue(facts.contains("#58a6ff"), "Color should resolve")
    }

    func testCircle() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "circle", source: """
            h(Circle, { width: 40, backgroundColor: "$color.red" })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Circle"))
        XCTAssertTrue(facts.contains("#f85149"), "Color should resolve")
    }

    // MARK: - Form Controls

    func testButtonWithChildren() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "btn", source: """
            h(Button, {
                id: "my-btn",
                padding: "$space.3",
                backgroundColor: "$color.blue",
                borderRadius: "$radius.2",
                onClick: function() { remember("test", "clicked", true); }
            },
                h(Text, { color: "$color.text" }, "Click Me")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Button"))
        XCTAssertTrue(facts.contains("Click Me"))
        XCTAssertTrue(facts.contains("#58a6ff"), "Button bg color resolved")
    }

    func testInputComponent() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "input", source: """
            h(Input, {
                id: "email",
                placeholder: "Enter email",
                fontSize: 14,
                backgroundColor: "$color.bg",
                onChange: function(e) { remember("form", "email", e.data); }
            })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Input"))
    }

    func testCheckbox() throws {
        let runtime = setupRuntime()
        // Checkbox only shows indicator children when checked=true
        runtime.mountProgram(id: "check", source: """
            h(XStack, { gap: 8, alignItems: "center" },
                h(Checkbox, {
                    id: "agree",
                    checked: true,
                    onCheckedChange: function(v) { remember("form", "agree", v); }
                },
                    h(Text, {}, "✓")
                ),
                h(Text, {}, "I agree to the terms")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("agree"), "Checkbox id should be present")
        XCTAssertTrue(facts.contains("I agree to the terms"), "Checkbox label should render")
    }

    func testSwitchComponent() throws {
        let runtime = setupRuntime()
        // Switch renders a track with a thumb, label is placed outside
        runtime.mountProgram(id: "switch-row", source: """
            h(XStack, { gap: 8, alignItems: "center" },
                h(Text, {}, "Dark Mode"),
                h(Switch, {
                    id: "dark-mode",
                    onCheckedChange: function(v) { remember("settings", "darkMode", v); }
                })
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Dark Mode"), "Switch label should render")
        XCTAssertTrue(facts.contains("dark-mode"), "Switch id should be present")
    }

    func testSlider() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "slider", source: """
            h(Slider, {
                id: "volume",
                min: 0, max: 100, step: 1,
                onValueChange: function(e) { remember("settings", "volume", e.data); }
            })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Slider"))
    }

    func testSeparator() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "sep", source: """
            h(YStack, {},
                h(Text, {}, "Above"),
                h(Separator, {}),
                h(Text, {}, "Below")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Separator"))
        XCTAssertTrue(facts.contains("Above"))
        XCTAssertTrue(facts.contains("Below"))
    }

    func testSpacer() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "spacer", source: """
            h(XStack, {},
                h(Text, {}, "Left"),
                h(Spacer, {}),
                h(Text, {}, "Right")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Spacer"))
    }

    // MARK: - Content Components

    func testScrollView() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "scroll", source: """
            h(ScrollView, { flex: 1 },
                h(Text, {}, "Item 1"),
                h(Text, {}, "Item 2"),
                h(Text, {}, "Item 3")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("ScrollView"))
        XCTAssertTrue(facts.contains("Item 1"))
        XCTAssertTrue(facts.contains("Item 3"))
    }

    func testImage() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "img", source: """
            h(Image, { src: "https://example.com/photo.jpg", width: 200, height: 150 })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Image"))
    }

    func testSpinner() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "spinner", source: """
            h(Spinner, {})
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Spinner"))
    }

    func testProgress() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "progress", source: """
            h(Progress, { value: 65, max: 100 })
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Progress"))
    }

    func testCard() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "card", source: """
            h(Card, {
                padding: "$space.4",
                backgroundColor: "$color.bg",
                borderRadius: "$radius.2",
                borderWidth: 1,
                borderColor: "$borderColor",
            },
                h(Text, { fontWeight: "600" }, "Card Title"),
                h(Text, { color: "$color.gray" }, "Card description here")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Card"))
        XCTAssertTrue(facts.contains("Card Title"))
        XCTAssertTrue(facts.contains("Card description here"))
    }

    func testListItem() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "list-item", source: """
            h(ListItem, { gap: 12 },
                h(Text, { fontWeight: "600" }, "Item Title"),
                h(Text, { color: "$color.gray" }, "Subtitle")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("ListItem"))
        XCTAssertTrue(facts.contains("Item Title"))
    }

    // MARK: - Style Properties

    func testPaddingShorthands() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "pad", source: """
            h(YStack, {
                padding: 10,
                paddingHorizontal: 20,
                paddingTop: 30,
            },
                h(Text, {}, "Padded")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"paddingTop\""))
        XCTAssertTrue(facts.contains("30"), "paddingTop should be 30")
    }

    func testBorderProperties() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "border", source: """
            h(YStack, {
                borderWidth: 2,
                borderColor: "$color.blue",
                borderRadius: "$radius.3",
            },
                h(Text, {}, "Bordered")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"borderWidth\""))
        XCTAssertTrue(facts.contains("\"borderRadius\""))
        XCTAssertTrue(facts.contains("#58a6ff"))
    }

    func testFlexProperties() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "flex", source: """
            h(XStack, {},
                h(YStack, { flex: 1 }, h(Text, {}, "Grows")),
                h(YStack, { width: 100 }, h(Text, {}, "Fixed"))
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"flex\""))
        XCTAssertTrue(facts.contains("Grows"))
        XCTAssertTrue(facts.contains("Fixed"))
    }

    func testTextStyleProperties() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "text-styles", source: """
            h(YStack, {},
                h(Text, { textAlign: "center" }, "Centered"),
                h(Text, { textTransform: "uppercase" }, "shouty"),
                h(Text, { letterSpacing: 2 }, "Spaced"),
                h(Text, { lineHeight: 1.8 }, "Tall lines"),
                h(Text, { textDecorationLine: "underline" }, "Underlined")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"textAlign\""))
        XCTAssertTrue(facts.contains("\"textTransform\""))
        XCTAssertTrue(facts.contains("\"letterSpacing\""))
        XCTAssertTrue(facts.contains("\"lineHeight\""))
    }

    func testOverflowHidden() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "overflow", source: """
            h(YStack, { overflow: "hidden", width: 100, height: 50 },
                h(Text, {}, "This text might overflow the container")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"overflow\""))
        XCTAssertTrue(facts.contains("hidden"))
    }

    func testOpacity() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "opacity", source: """
            h(YStack, { opacity: 0.5 },
                h(Text, {}, "Semi-transparent")
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("\"opacity\""))
        XCTAssertTrue(facts.contains("0.5"))
    }

    // MARK: - Complex Layout

    func testComplexFormLayout() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "form", source: """
            h(YStack, { gap: 16, padding: "$space.4" },
                h(H2, {}, "Settings"),
                h(Separator, {}),
                h(XStack, { gap: 8, alignItems: "center" },
                    h(Label, {}, "Username"),
                    h(Input, { flex: 1, placeholder: "Enter username" })
                ),
                h(XStack, { gap: 8, alignItems: "center" },
                    h(Label, {}, "Dark Mode"),
                    h(Spacer, {}),
                    h(Switch, { id: "dark-switch" })
                ),
                h(XStack, { gap: 8, alignItems: "center" },
                    h(Label, {}, "Volume"),
                    h(Slider, { flex: 1, min: 0, max: 100 })
                ),
                h(XStack, { gap: 8, alignItems: "center" },
                    h(Checkbox, { id: "agree-check", checked: true },
                        h(Text, {}, "✓")
                    ),
                    h(Text, {}, "Accept terms")
                ),
                h(Button, {
                    padding: "$space.3",
                    backgroundColor: "$color.blue",
                    borderRadius: "$radius.2",
                    onClick: function() {}
                },
                    h(Text, { color: "#ffffff" }, "Submit")
                )
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("Settings"))
        XCTAssertTrue(facts.contains("Username"))
        XCTAssertTrue(facts.contains("Dark Mode"))
        XCTAssertTrue(facts.contains("Volume"))
        XCTAssertTrue(facts.contains("Accept terms"))
        XCTAssertTrue(facts.contains("Submit"))
        XCTAssertTrue(facts.contains("Separator"))
        XCTAssertTrue(facts.contains("Slider"))
        XCTAssertTrue(facts.contains("Accept terms"))
    }

    func testCatalogStyledFrameTags() throws {
        let runtime = setupRuntime()
        runtime.mountProgram(id: "catalog-frames", source: """
            h(YStack, { gap: 12 },
                h(Checkbox, { id: "accepted", checked: true }, h(Checkbox.Indicator, {}, h(Text, {}, "ok"))),
                h(Switch, { id: "notifications", checked: true }),
                h(RadioGroup, { value: "native", orientation: "horizontal" },
                    h(RadioGroup.Item, { value: "web", checked: false }),
                    h(RadioGroup.Item, { value: "native", checked: true }, h(RadioGroup.Indicator, {}))
                ),
                h(Slider, { value: [48], min: 0, max: 100 }),
                h(Progress, { value: 48, max: 100 }),
                h(Tabs, { value: "overview" },
                    h(Tabs.List, {},
                        h(Tabs.Tab, {}, h(Text, {}, "Overview")),
                        h(Tabs.Tab, {}, h(Text, {}, "Native"))
                    ),
                    h(Tabs.Content, {}, h(Text, {}, "Tab content"))
                )
            )
        """)
        let facts = runtime.getCurrentFacts()
        XCTAssertTrue(facts.contains("CheckboxFrame"))
        XCTAssertTrue(facts.contains("SwitchFrame"))
        XCTAssertTrue(facts.contains("RadioGroupFrame"))
        XCTAssertTrue(facts.contains("RadioItemFrame"))
        XCTAssertTrue(facts.contains("SliderFrame"))
        XCTAssertTrue(facts.contains("ProgressFrame"))
        XCTAssertTrue(facts.contains("TabsTab"))
        XCTAssertTrue(facts.contains("aria-valuenow"))
        XCTAssertTrue(facts.contains("48"))
    }

    // MARK: - Helper Tests

    func testTextAlignmentMapping() throws {
        XCTAssertEqual(mapTextAlignment("center"), .center)
        XCTAssertEqual(mapTextAlignment("right"), .trailing)
        XCTAssertEqual(mapTextAlignment("end"), .trailing)
        XCTAssertEqual(mapTextAlignment("left"), .leading)
    }

    func testVAlignmentWithStart() throws {
        XCTAssertEqual(mapVAlignment("flex-start"), .top)
        XCTAssertEqual(mapVAlignment("start"), .top)
    }

    func testObjectFitMapping() throws {
        XCTAssertEqual(mapObjectFit("contain"), .fit)
        XCTAssertEqual(mapObjectFit("cover"), .fill)
        XCTAssertEqual(mapObjectFit(nil), .fill)
    }

    func testNativeTagClassifiers() throws {
        XCTAssertTrue(isButtonLikeTag("TabsTab"))
        XCTAssertTrue(isButtonLikeTag("SelectTrigger"))
        XCTAssertTrue(isTextLikeTag("DialogTitle"))
        XCTAssertTrue(isTextLikeTag("SelectItemText"))
        XCTAssertFalse(isButtonLikeTag("YStack"))
    }
}
