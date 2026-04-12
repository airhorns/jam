import SwiftUI

// MARK: - Style Application

extension View {
    /// Apply resolved Jam style properties as SwiftUI modifiers.
    @ViewBuilder
    func applyStyles(_ styles: [String: JamTerm]) -> some View {
        self
            .applyPadding(styles)
            .applyFrame(styles)
            .applyBackground(styles)
            .applyBorder(styles)
            .modifier(OptionalOpacity(opacity: styles["opacity"]?.doubleValue))
            .modifier(OptionalForegroundColor(color: styles["color"]?.stringValue))
    }

    @ViewBuilder
    func applyPadding(_ styles: [String: JamTerm]) -> some View {
        let top = styles["paddingTop"]?.doubleValue ?? styles["padding"]?.doubleValue
        let right = styles["paddingRight"]?.doubleValue ?? styles["padding"]?.doubleValue
        let bottom = styles["paddingBottom"]?.doubleValue ?? styles["padding"]?.doubleValue
        let left = styles["paddingLeft"]?.doubleValue ?? styles["padding"]?.doubleValue

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

    @ViewBuilder
    func applyFrame(_ styles: [String: JamTerm]) -> some View {
        let w = styles["width"]?.doubleValue.map { CGFloat($0) }
        let h = styles["height"]?.doubleValue.map { CGFloat($0) }
        let minW = styles["minWidth"]?.doubleValue.map { CGFloat($0) }
        let maxW = styles["maxWidth"]?.doubleValue.map { CGFloat($0) }
        let minH = styles["minHeight"]?.doubleValue.map { CGFloat($0) }
        let maxH = styles["maxHeight"]?.doubleValue.map { CGFloat($0) }
        let flex = styles["flex"]?.doubleValue

        if w != nil || h != nil || minW != nil || maxW != nil || minH != nil || maxH != nil {
            self.frame(
                minWidth: minW,
                idealWidth: w,
                maxWidth: maxW ?? (flex != nil ? .infinity : nil),
                minHeight: minH,
                idealHeight: h,
                maxHeight: maxH ?? (flex != nil ? .infinity : nil)
            )
        } else if flex != nil {
            self.frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            self
        }
    }

    @ViewBuilder
    func applyBackground(_ styles: [String: JamTerm]) -> some View {
        if let bg = styles["backgroundColor"]?.stringValue {
            self.background(Color(hex: bg))
        } else {
            self
        }
    }

    @ViewBuilder
    func applyBorder(_ styles: [String: JamTerm]) -> some View {
        let radius = styles["borderRadius"]?.doubleValue.map { CGFloat($0) } ?? 0
        let borderWidth = styles["borderWidth"]?.doubleValue.map { CGFloat($0) }
        let borderColor = styles["borderColor"]?.stringValue

        if let bw = borderWidth, let bc = borderColor {
            self
                .clipShape(RoundedRectangle(cornerRadius: radius))
                .overlay(
                    RoundedRectangle(cornerRadius: radius)
                        .stroke(Color(hex: bc), lineWidth: CGFloat(bw))
                )
        } else if radius > 0 {
            self.clipShape(RoundedRectangle(cornerRadius: radius))
        } else {
            self
        }
    }

    /// Apply text-specific styles (font size, weight, color).
    @ViewBuilder
    func applyTextStyles(_ styles: [String: JamTerm]) -> some View {
        self
            .modifier(OptionalFontSize(
                size: styles["fontSize"]?.doubleValue,
                weight: styles["fontWeight"]?.stringValue
            ))
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

struct OptionalFontSize: ViewModifier {
    let size: Double?
    let weight: String?
    func body(content: Content) -> some View {
        if let s = size {
            content.font(.system(size: CGFloat(s), weight: mapFontWeight(weight)))
        } else {
            content
        }
    }
}

// MARK: - Color Extension

extension Color {
    /// Initialize a Color from a hex string (#RRGGBB or #RRGGBBAA).
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
