import SwiftUI

// MARK: - Style Application

extension View {
    /// Apply resolved Jam style properties as SwiftUI modifiers.
    @ViewBuilder
    func applyStyles(
        _ styles: [String: JamTerm],
        runtime: JamRuntime?,
        entity: UIEntity
    ) -> some View {
        self
            .applyPadding(styles)
            .applyMargin(styles)
            .applyFrame(styles)
            .applyBackground(styles)
            .applyBorder(styles)
            .applyShadow(styles)
            .modifier(OptionalOpacity(opacity: styles["opacity"]?.doubleValue))
            .modifier(OptionalForegroundColor(color: styles["color"]?.stringValue))
            .modifier(OptionalZIndex(zIndex: styles["zIndex"]?.doubleValue))
            .applyOverflow(styles)
            .applyDisabled(entity)
    }

    // MARK: - Padding

    @ViewBuilder
    func applyPadding(_ styles: [String: JamTerm]) -> some View {
        let pAll = styles["padding"]?.doubleValue
        let pHoriz = styles["paddingHorizontal"]?.doubleValue
        let pVert = styles["paddingVertical"]?.doubleValue
        let top = styles["paddingTop"]?.doubleValue ?? pVert ?? pAll
        let right = styles["paddingRight"]?.doubleValue ?? pHoriz ?? pAll
        let bottom = styles["paddingBottom"]?.doubleValue ?? pVert ?? pAll
        let left = styles["paddingLeft"]?.doubleValue ?? pHoriz ?? pAll

        if top != nil || right != nil || bottom != nil || left != nil {
            self.padding(EdgeInsets(
                top: CGFloat(top ?? 0),
                leading: CGFloat(left ?? 0),
                bottom: CGFloat(bottom ?? 0),
                trailing: CGFloat(right ?? 0)
            ))
        } else {
            self
        }
    }

    // MARK: - Margin (approximated as outer padding)

    @ViewBuilder
    func applyMargin(_ styles: [String: JamTerm]) -> some View {
        let mAll = styles["margin"]?.doubleValue
        let mHoriz = styles["marginHorizontal"]?.doubleValue
        let mVert = styles["marginVertical"]?.doubleValue
        let top = styles["marginTop"]?.doubleValue ?? mVert ?? mAll
        let right = styles["marginRight"]?.doubleValue ?? mHoriz ?? mAll
        let bottom = styles["marginBottom"]?.doubleValue ?? mVert ?? mAll
        let left = styles["marginLeft"]?.doubleValue ?? mHoriz ?? mAll

        // SwiftUI has no true margin — we approximate with .padding on the outer edge.
        // This is imperfect but better than ignoring margins entirely.
        if top != nil || right != nil || bottom != nil || left != nil {
            self.padding(EdgeInsets(
                top: CGFloat(top ?? 0),
                leading: CGFloat(left ?? 0),
                bottom: CGFloat(bottom ?? 0),
                trailing: CGFloat(right ?? 0)
            ))
        } else {
            self
        }
    }

    // MARK: - Frame / Sizing

    @ViewBuilder
    func applyFrame(_ styles: [String: JamTerm]) -> some View {
        let w = styles["width"]?.doubleValue.map { CGFloat($0) }
        let h = styles["height"]?.doubleValue.map { CGFloat($0) }
        let minW = styles["minWidth"]?.doubleValue.map { CGFloat($0) }
        let maxW = styles["maxWidth"]?.doubleValue.map { CGFloat($0) }
        let minH = styles["minHeight"]?.doubleValue.map { CGFloat($0) }
        let maxH = styles["maxHeight"]?.doubleValue.map { CGFloat($0) }
        let flex = styles["flex"]?.doubleValue
        let flexGrow = styles["flexGrow"]?.doubleValue
        let flexShrink = styles["flexShrink"]?.doubleValue

        if w != nil || h != nil || minW != nil || maxW != nil || minH != nil || maxH != nil {
            self.frame(
                minWidth: minW,
                idealWidth: w,
                maxWidth: maxW ?? (flex != nil || flexGrow != nil ? .infinity : nil),
                minHeight: minH,
                idealHeight: h,
                maxHeight: maxH ?? (flex != nil || flexGrow != nil ? .infinity : nil)
            )
        } else if flex != nil || flexGrow != nil {
            self.frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if flexShrink != nil {
            self.fixedSize(horizontal: flexShrink == 0, vertical: false)
        } else {
            self
        }
    }

    // MARK: - Background

    @ViewBuilder
    func applyBackground(_ styles: [String: JamTerm]) -> some View {
        if let bg = styles["backgroundColor"]?.stringValue {
            self.background(Color(hex: bg))
        } else {
            self
        }
    }

    // MARK: - Border

    @ViewBuilder
    func applyBorder(_ styles: [String: JamTerm]) -> some View {
        let radiusAll = styles["borderRadius"]?.doubleValue.map { CGFloat($0) } ?? 0
        let topLeft = styles["borderTopLeftRadius"]?.doubleValue.map { CGFloat($0) } ?? radiusAll
        let topRight = styles["borderTopRightRadius"]?.doubleValue.map { CGFloat($0) } ?? radiusAll
        let bottomLeft = styles["borderBottomLeftRadius"]?.doubleValue.map { CGFloat($0) } ?? radiusAll
        let bottomRight = styles["borderBottomRightRadius"]?.doubleValue.map { CGFloat($0) } ?? radiusAll
        // Use the max radius for the RoundedRectangle (SwiftUI doesn't support per-corner easily)
        let radius = max(topLeft, topRight, bottomLeft, bottomRight)

        let bwAll = styles["borderWidth"]?.doubleValue.map { CGFloat($0) }
        let bwTop = styles["borderTopWidth"]?.doubleValue.map { CGFloat($0) }
        let bwRight = styles["borderRightWidth"]?.doubleValue.map { CGFloat($0) }
        let bwBottom = styles["borderBottomWidth"]?.doubleValue.map { CGFloat($0) }
        let bwLeft = styles["borderLeftWidth"]?.doubleValue.map { CGFloat($0) }

        let bcAll = styles["borderColor"]?.stringValue

        let hasBorder = bwAll != nil || bwTop != nil || bwRight != nil || bwBottom != nil || bwLeft != nil

        if hasBorder, let bc = bcAll {
            let bw = bwAll ?? max(bwTop ?? 0, bwRight ?? 0, bwBottom ?? 0, bwLeft ?? 0)
            self
                .clipShape(RoundedRectangle(cornerRadius: radius))
                .overlay(
                    RoundedRectangle(cornerRadius: radius)
                        .stroke(Color(hex: bc), lineWidth: bw)
                )
        } else if radius > 0 {
            self.clipShape(RoundedRectangle(cornerRadius: radius))
        } else {
            self
        }
    }

    // MARK: - Shadow

    @ViewBuilder
    func applyShadow(_ styles: [String: JamTerm]) -> some View {
        if styles["boxShadow"]?.stringValue != nil {
            // Parse simple shadow: "0px 4px 8px rgba(0,0,0,0.3)"
            // For now just apply a default shadow if any boxShadow is insert
            self.shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
        } else if let shadowColor = styles["shadowColor"]?.stringValue {
            self.shadow(color: Color(hex: shadowColor).opacity(0.3), radius: 4, x: 0, y: 2)
        } else {
            self
        }
    }

    // MARK: - Overflow

    @ViewBuilder
    func applyOverflow(_ styles: [String: JamTerm]) -> some View {
        let overflow = styles["overflow"]?.stringValue
        if overflow == "hidden" {
            self.clipped()
        } else {
            self
        }
    }

    // MARK: - Disabled

    @ViewBuilder
    func applyDisabled(_ entity: UIEntity) -> some View {
        if let disabled = entity.props["disabled"] {
            self.disabled(disabled.boolValue == true || disabled.stringValue == "true")
        } else {
            self
        }
    }

    // MARK: - Text Styles

    @ViewBuilder
    func applyTextStyles(_ styles: [String: JamTerm], defaultSize: CGFloat? = nil, defaultWeight: Font.Weight? = nil) -> some View {
        self
            .modifier(FontModifier(
                size: styles["fontSize"]?.doubleValue,
                weight: styles["fontWeight"]?.stringValue,
                family: styles["fontFamily"]?.stringValue,
                defaultSize: defaultSize,
                defaultWeight: defaultWeight
            ))
            .modifier(TextAlignModifier(align: styles["textAlign"]?.stringValue))
            .modifier(LineSpacingModifier(lineHeight: styles["lineHeight"]?.doubleValue, fontSize: styles["fontSize"]?.doubleValue))
            .modifier(LetterSpacingModifier(spacing: styles["letterSpacing"]?.doubleValue))
            .modifier(TextCaseModifier(transform: styles["textTransform"]?.stringValue))
            .modifier(TextDecorationModifier(decoration: styles["textDecorationLine"]?.stringValue))
    }

    // MARK: - TextField Styles

    @ViewBuilder
    func applyTextFieldStyles(_ styles: [String: JamTerm]) -> some View {
        self
            .modifier(FontModifier(
                size: styles["fontSize"]?.doubleValue,
                weight: styles["fontWeight"]?.stringValue,
                family: styles["fontFamily"]?.stringValue
            ))
    }

    // MARK: - Shape Styles (for Square/Circle)

    @ViewBuilder
    func applyShapeStyles(_ styles: [String: JamTerm]) -> some View {
        if let bg = styles["backgroundColor"]?.stringValue {
            self.foregroundStyle(Color(hex: bg))
        } else {
            self
        }
    }
}

// MARK: - View Modifiers

struct OptionalOpacity: ViewModifier {
    let opacity: Double?
    func body(content: Content) -> some View {
        if let o = opacity { content.opacity(o) }
        else { content }
    }
}

struct OptionalForegroundColor: ViewModifier {
    let color: String?
    func body(content: Content) -> some View {
        if let c = color { content.foregroundStyle(Color(hex: c)) }
        else { content }
    }
}

struct OptionalZIndex: ViewModifier {
    let zIndex: Double?
    func body(content: Content) -> some View {
        if let z = zIndex { content.zIndex(z) }
        else { content }
    }
}

struct FontModifier: ViewModifier {
    let size: Double?
    let weight: String?
    let family: String?
    var defaultSize: CGFloat? = nil
    var defaultWeight: Font.Weight? = nil

    func body(content: Content) -> some View {
        let fontSize = CGFloat(size ?? Double(defaultSize ?? 0))
        let fontWeight = weight != nil ? mapFontWeight(weight) : defaultWeight

        if let family = family, !family.isEmpty, fontSize > 0 {
            content.font(.custom(cleanFontFamily(family), size: fontSize).weight(fontWeight ?? .regular))
        } else if fontSize > 0 {
            content.font(.system(size: fontSize, weight: fontWeight ?? .regular))
        } else if let w = fontWeight {
            content.fontWeight(w)
        } else {
            content
        }
    }

    func cleanFontFamily(_ family: String) -> String {
        // Extract the first font name from a CSS font-family string
        family.split(separator: ",").first?
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: "\"", with: "")
            ?? family
    }
}

struct TextAlignModifier: ViewModifier {
    let align: String?
    func body(content: Content) -> some View {
        if let align = align {
            content.multilineTextAlignment(mapTextAlignment(align))
        } else {
            content
        }
    }
}

struct LineSpacingModifier: ViewModifier {
    let lineHeight: Double?
    let fontSize: Double?

    private var spacing: CGFloat? {
        guard let lh = lineHeight else { return nil }
        if lh > 3 {
            return max(0, CGFloat(lh) - CGFloat(fontSize ?? 14))
        } else {
            return max(0, CGFloat((fontSize ?? 14) * (lh - 1)))
        }
    }

    func body(content: Content) -> some View {
        if let s = spacing {
            content.lineSpacing(s)
        } else {
            content
        }
    }
}

struct LetterSpacingModifier: ViewModifier {
    let spacing: Double?
    func body(content: Content) -> some View {
        if let s = spacing { content.tracking(CGFloat(s)) }
        else { content }
    }
}

struct TextCaseModifier: ViewModifier {
    let transform: String?
    func body(content: Content) -> some View {
        switch transform {
        case "uppercase": content.textCase(.uppercase)
        case "lowercase": content.textCase(.lowercase)
        default: content
        }
    }
}

struct TextDecorationModifier: ViewModifier {
    let decoration: String?
    func body(content: Content) -> some View {
        switch decoration {
        case "underline": content.underline()
        case "line-through": content.strikethrough()
        default: content
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        let r, g, b, a: Double
        switch hex.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255.0
            g = Double((int >> 8) & 0xFF) / 255.0
            b = Double(int & 0xFF) / 255.0
            a = 1.0
        case 8:
            r = Double((int >> 24) & 0xFF) / 255.0
            g = Double((int >> 16) & 0xFF) / 255.0
            b = Double((int >> 8) & 0xFF) / 255.0
            a = Double(int & 0xFF) / 255.0
        default:
            r = 0; g = 0; b = 0; a = 1
        }
        self.init(red: r, green: g, blue: b, opacity: a)
    }
}

// MARK: - Alignment & Font Helpers

func mapHAlignment(_ value: String?) -> HorizontalAlignment {
    switch value {
    case "center": return .center
    case "flex-end", "end": return .trailing
    default: return .leading
    }
}

func mapVAlignment(_ value: String?) -> VerticalAlignment {
    switch value {
    case "center": return .center
    case "flex-start", "start": return .top
    case "flex-end", "end": return .bottom
    default: return .center
    }
}

func mapFontWeight(_ value: String?) -> Font.Weight {
    switch value {
    case "100": return .ultraLight
    case "200": return .thin
    case "300": return .light
    case "400": return .regular
    case "500": return .medium
    case "600": return .semibold
    case "700": return .bold
    case "800": return .heavy
    case "900": return .black
    default: return .regular
    }
}

func mapTextAlignment(_ value: String) -> TextAlignment {
    switch value {
    case "center": return .center
    case "right", "end": return .trailing
    default: return .leading
    }
}
