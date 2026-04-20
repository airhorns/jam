import SwiftUI

/// Root SwiftUI view that renders a Jam component tree from the fact database.
public struct JamView: View {
    let runtime: JamRuntime

    public init(runtime: JamRuntime) {
        self.runtime = runtime
    }

    public var body: some View {
        ForEach(runtime.rootChildren, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }
}

/// Renders a single entity and its children recursively.
struct EntityView: View {
    let entityId: String
    let runtime: JamRuntime

    var body: some View {
        if let entity = runtime.entities[entityId] {
            renderEntity(entity)
        }
    }

    @ViewBuilder
    func renderEntity(_ entity: UIEntity) -> some View {
        if isButtonLikeTag(entity.tag) {
            renderButton(entity)
        } else if isTextLikeTag(entity.tag) {
            renderText(entity)
        } else {
            switch entity.tag {

            // MARK: - Layout

            case "YStack", "Stack":
                let spacing = entity.styles["gap"]?.doubleValue
                let alignment = mapHAlignment(entity.styles["alignItems"]?.stringValue)
                VStack(alignment: alignment, spacing: spacing.map { CGFloat($0) }) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "XStack":
                let spacing = entity.styles["gap"]?.doubleValue
                let alignment = mapVAlignment(entity.styles["alignItems"]?.stringValue)
                HStack(alignment: alignment, spacing: spacing.map { CGFloat($0) }) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "ZStack":
                ZStack {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Group", "XGroup":
                HStack(spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "YGroup":
                VStack(spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            // MARK: - Typography

            case "Text", "SizableText", "Paragraph", "Label":
                renderText(entity)

            case "Heading", "H1":
                renderText(entity, defaultSize: 28, defaultWeight: .bold)

            case "H2":
                renderText(entity, defaultSize: 24, defaultWeight: .bold)

            case "H3":
                renderText(entity, defaultSize: 20, defaultWeight: .semibold)

            case "H4":
                renderText(entity, defaultSize: 18, defaultWeight: .semibold)

            case "H5":
                renderText(entity, defaultSize: 16, defaultWeight: .medium)

            case "H6":
                renderText(entity, defaultSize: 14, defaultWeight: .medium)

            case "__text":
                if let text = entity.text {
                    Text(text)
                }

            // MARK: - Shapes

            case "Square", "SheetHandle", "PopoverArrow", "SliderTrack", "SliderTrackActive", "ProgressIndicator":
                let size = entity.styles["width"]?.doubleValue ?? entity.styles["height"]?.doubleValue ?? 40
                Rectangle()
                    .frame(width: CGFloat(size), height: CGFloat(size))
                    .applyShapeStyles(entity.styles)
                    .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Circle", "RadioGroupIndicator", "SliderThumb", "SwitchThumb":
                let size = entity.styles["width"]?.doubleValue ?? entity.styles["height"]?.doubleValue ?? 40
                SwiftUI.Circle()
                    .frame(width: CGFloat(size), height: CGFloat(size))
                    .applyShapeStyles(entity.styles)
                    .applyStyles(entity.styles, runtime: runtime, entity: entity)

            // MARK: - Form Controls

            case "Button":
                renderButton(entity)

            case "Input":
                JamTextField(entity: entity, runtime: runtime)

            case "TextArea":
                JamTextEditor(entity: entity, runtime: runtime)

            case "Checkbox", "CheckboxFrame":
                JamCheckbox(entity: entity, runtime: runtime)

            case "Switch", "SwitchFrame":
                JamSwitch(entity: entity, runtime: runtime)

            case "Slider", "SliderFrame":
                JamSlider(entity: entity, runtime: runtime)

            case "RadioItemFrame":
                JamRadioItem(entity: entity, runtime: runtime)

            case "Separator":
                Divider()
                    .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Spacer":
                Spacer()

            // MARK: - Content

            case "ScrollView", "SheetScrollView", "SelectViewport":
                let horizontal = entity.styles["flexDirection"]?.stringValue == "row"
                ScrollView(horizontal ? .horizontal : .vertical, showsIndicators: true) {
                    if horizontal {
                        HStack(spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }) {
                            renderChildren(entity)
                        }
                    } else {
                        VStack(spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }) {
                            renderChildren(entity)
                        }
                    }
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Image", "AvatarImage":
                JamImage(entity: entity)

            case "Spinner":
                ProgressView()
                    .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Progress", "ProgressFrame":
                JamProgress(entity: entity)

            case "Card":
                VStack(alignment: .leading, spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "Avatar":
                let size = entity.styles["width"]?.doubleValue ?? 40
                ZStack {
                    renderChildren(entity)
                }
                .frame(width: CGFloat(size), height: CGFloat(size))
                .clipShape(SwiftUI.Circle())
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "ListItem":
                HStack(spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) } ?? 12) {
                    renderChildren(entity)
                }
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

            case "VisuallyHidden":
                renderChildren(entity)
                    .accessibilityHidden(false)
                    .frame(width: 1, height: 1)
                    .opacity(0)

            // MARK: - Default

            default:
                renderStyledContainer(entity)
            }
        }
    }

    @ViewBuilder
    func renderChildren(_ entity: UIEntity) -> some View {
        ForEach(entity.children, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }

    @ViewBuilder
    func renderText(_ entity: UIEntity, defaultSize: CGFloat? = nil, defaultWeight: Font.Weight? = nil) -> some View {
        let textContent = collectTextContent(entity)
        Text(textContent)
            .applyTextStyles(entity.styles, defaultSize: defaultSize, defaultWeight: defaultWeight)
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }

    func collectTextContent(_ entity: UIEntity) -> String {
        if let text = entity.text { return text }
        return entity.children.compactMap { child in
            guard let childEntity = runtime.entities[child.id] else { return nil }
            return collectTextContent(childEntity)
        }.joined()
    }

    @ViewBuilder
    func renderButton(_ entity: UIEntity) -> some View {
        Button(action: {
            if entity.handlers.contains("click") {
                runtime.fireEvent(entityId: entity.id, event: "click")
            } else if entity.handlers.contains("press") {
                runtime.fireEvent(entityId: entity.id, event: "press")
            }
        }) {
            renderChildren(entity)
        }
        .buttonStyle(.plain)
        .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }

    @ViewBuilder
    func renderStyledContainer(_ entity: UIEntity) -> some View {
        if entity.styles["display"]?.stringValue == "contents" {
            renderChildren(entity)
        } else if entity.styles["position"]?.stringValue == "absolute" || entity.styles["position"]?.stringValue == "fixed" {
            ZStack {
                renderChildren(entity)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
        } else if entity.styles["flexDirection"]?.stringValue == "row" {
            HStack(
                alignment: mapVAlignment(entity.styles["alignItems"]?.stringValue),
                spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }
            ) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
        } else {
            VStack(
                alignment: mapHAlignment(entity.styles["alignItems"]?.stringValue),
                spacing: entity.styles["gap"]?.doubleValue.map { CGFloat($0) }
            ) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
        }
    }
}

// MARK: - Form Control Views

struct JamTextField: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var text: String

    init(entity: UIEntity, runtime: JamRuntime) {
        self.entity = entity
        self.runtime = runtime
        _text = State(initialValue: entity.props["value"]?.stringValue ?? entity.props["defaultValue"]?.stringValue ?? "")
    }

    var body: some View {
        TextField(
            entity.props["placeholder"]?.stringValue ?? "",
            text: $text
        )
        .onSubmit {
            runtime.fireEvent(entityId: entity.id, event: "submit", data: text)
        }
        .onChange(of: text) { _, newValue in
            runtime.fireEvent(entityId: entity.id, event: "change", data: newValue)
        }
        .applyTextFieldStyles(entity.styles)
        .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }
}

struct JamTextEditor: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var text: String

    init(entity: UIEntity, runtime: JamRuntime) {
        self.entity = entity
        self.runtime = runtime
        _text = State(initialValue: entity.props["value"]?.stringValue ?? entity.props["defaultValue"]?.stringValue ?? "")
    }

    var body: some View {
        TextEditor(text: $text)
            .onChange(of: text) { _, newValue in
                runtime.fireEvent(entityId: entity.id, event: "change", data: newValue)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }
}

struct JamCheckbox: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var isChecked: Bool

    init(entity: UIEntity, runtime: JamRuntime) {
        self.entity = entity
        self.runtime = runtime
        _isChecked = State(initialValue: boolProp(entity, "checked") ?? boolProp(entity, "aria-checked") ?? false)
    }

    var body: some View {
        Toggle(isOn: $isChecked) {
            renderChildren()
        }
        .toggleStyle(.checkbox)
        .onChange(of: isChecked) { _, newValue in
            if entity.handlers.contains("click") {
                runtime.fireEvent(entityId: entity.id, event: "click")
            } else {
                runtime.fireEvent(entityId: entity.id, event: "checkedchange", data: newValue ? "true" : "false")
            }
        }
        .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }

    @ViewBuilder
    func renderChildren() -> some View {
        ForEach(entity.children, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }
}

struct JamSwitch: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var isOn: Bool

    init(entity: UIEntity, runtime: JamRuntime) {
        self.entity = entity
        self.runtime = runtime
        _isOn = State(initialValue: boolProp(entity, "checked") ?? boolProp(entity, "aria-checked") ?? false)
    }

    var body: some View {
        Toggle(isOn: $isOn) {
            renderChildren()
        }
        .toggleStyle(.switch)
        .onChange(of: isOn) { _, newValue in
            if entity.handlers.contains("click") {
                runtime.fireEvent(entityId: entity.id, event: "click")
            } else {
                runtime.fireEvent(entityId: entity.id, event: "checkedchange", data: newValue ? "true" : "false")
            }
        }
        .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }

    @ViewBuilder
    func renderChildren() -> some View {
        ForEach(entity.children, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }
}

struct JamSlider: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var value: Double

    init(entity: UIEntity, runtime: JamRuntime) {
        self.entity = entity
        self.runtime = runtime
        _value = State(initialValue:
            entity.props["value"]?.doubleValue ??
            entity.props["aria-valuenow"]?.doubleValue ??
            entity.props["defaultValue"]?.doubleValue ??
            0
        )
    }

    var body: some View {
        let min = entity.props["min"]?.doubleValue ?? entity.props["aria-valuemin"]?.doubleValue ?? 0
        let max = entity.props["max"]?.doubleValue ?? entity.props["aria-valuemax"]?.doubleValue ?? 100
        let step = entity.props["step"]?.doubleValue ?? 1

        SwiftUI.Slider(value: $value, in: min...max, step: step)
            .onChange(of: value) { _, newValue in
                if entity.handlers.contains("valuechange") {
                    runtime.fireEvent(entityId: entity.id, event: "valuechange", data: String(newValue))
                } else if entity.handlers.contains("change") {
                    runtime.fireEvent(entityId: entity.id, event: "change", data: String(newValue))
                }
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }
}

struct JamRadioItem: View {
    let entity: UIEntity
    let runtime: JamRuntime

    var isChecked: Bool {
        boolProp(entity, "checked") ?? boolProp(entity, "aria-checked") ?? false
    }

    var body: some View {
        Button(action: {
            if entity.handlers.contains("click") {
                runtime.fireEvent(entityId: entity.id, event: "click")
            } else if entity.handlers.contains("select") {
                runtime.fireEvent(entityId: entity.id, event: "select")
            }
        }) {
            ZStack {
                SwiftUI.Circle()
                    .stroke(Color(hex: entity.styles["borderColor"]?.stringValue ?? "#8b949e"), lineWidth: CGFloat(entity.styles["borderWidth"]?.doubleValue ?? 2))
                if isChecked {
                    SwiftUI.Circle()
                        .fill(Color(hex: entity.styles["color"]?.stringValue ?? entity.styles["backgroundColor"]?.stringValue ?? "#0a84ff"))
                        .frame(width: 10, height: 10)
                }
                renderChildren()
            }
        }
        .buttonStyle(.plain)
        .applyStyles(entity.styles, runtime: runtime, entity: entity)
    }

    @ViewBuilder
    func renderChildren() -> some View {
        ForEach(entity.children, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }
}

// MARK: - Content Views

struct JamImage: View {
    let entity: UIEntity

    var body: some View {
        if let src = entity.props["src"]?.stringValue, let url = URL(string: src) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: mapObjectFit(entity.styles["objectFit"]?.stringValue))
                case .failure:
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                case .empty:
                    ProgressView()
                @unknown default:
                    EmptyView()
                }
            }
            .applyFrame(entity.styles)
            .applyBorder(entity.styles)
        } else {
            Image(systemName: entity.props["systemName"]?.stringValue ?? "photo")
                .applyFrame(entity.styles)
        }
    }
}

struct JamProgress: View {
    let entity: UIEntity

    var body: some View {
        let value = entity.props["value"]?.doubleValue ?? entity.props["aria-valuenow"]?.doubleValue ?? 0
        let max = entity.props["max"]?.doubleValue ?? entity.props["aria-valuemax"]?.doubleValue ?? 100
        ProgressView(value: value, total: max)
            .applyStyles(entity.styles, runtime: nil, entity: entity)
    }
}

// MARK: - Helpers

func mapObjectFit(_ value: String?) -> ContentMode {
    switch value {
    case "contain", "scale-down": return .fit
    default: return .fill
    }
}

func boolProp(_ entity: UIEntity, _ key: String) -> Bool? {
    guard let value = entity.props[key] else { return nil }
    if let bool = value.boolValue { return bool }
    switch value.stringValue?.lowercased() {
    case "true", "1", "yes", "on": return true
    case "false", "0", "no", "off": return false
    default: return nil
    }
}

func isButtonLikeTag(_ tag: String) -> Bool {
    switch tag {
    case "Button",
         "DialogTrigger",
         "DialogClose",
         "FormTrigger",
         "PopoverTrigger",
         "PopoverClose",
         "SelectTrigger",
         "SelectItem",
         "TabsTab",
         "ToggleGroupItem",
         "AccordionTrigger":
        return true
    default:
        return false
    }
}

func isTextLikeTag(_ tag: String) -> Bool {
    switch tag {
    case "ButtonText",
         "DialogTitle",
         "DialogDescription",
         "SelectValue",
         "SelectItemText",
         "SelectLabel",
         "ToastTitle",
         "ToastDescription",
         "TooltipContent":
        return true
    default:
        return false
    }
}
