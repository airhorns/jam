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

        case "Square":
            let size = entity.styles["width"]?.doubleValue ?? entity.styles["height"]?.doubleValue ?? 40
            Rectangle()
                .frame(width: CGFloat(size), height: CGFloat(size))
                .applyShapeStyles(entity.styles)
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

        case "Circle":
            let size = entity.styles["width"]?.doubleValue ?? entity.styles["height"]?.doubleValue ?? 40
            SwiftUI.Circle()
                .frame(width: CGFloat(size), height: CGFloat(size))
                .applyShapeStyles(entity.styles)
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

        // MARK: - Form Controls

        case "Button":
            Button(action: {
                runtime.fireEvent(entityId: entity.id, event: "click")
            }) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)

        case "Input":
            JamTextField(entity: entity, runtime: runtime)

        case "TextArea":
            JamTextEditor(entity: entity, runtime: runtime)

        case "Checkbox":
            JamCheckbox(entity: entity, runtime: runtime)

        case "Switch":
            JamSwitch(entity: entity, runtime: runtime)

        case "Slider":
            JamSlider(entity: entity, runtime: runtime)

        case "Separator":
            Divider()
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

        case "Spacer":
            Spacer()

        // MARK: - Content

        case "ScrollView":
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

        case "Image":
            JamImage(entity: entity)

        case "Spinner":
            ProgressView()
                .applyStyles(entity.styles, runtime: runtime, entity: entity)

        case "Progress":
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
            VStack(alignment: .leading) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
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
}

// MARK: - Form Control Views

struct JamTextField: View {
    let entity: UIEntity
    let runtime: JamRuntime
    @State private var text: String = ""

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
    @State private var text: String = ""

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
    @State private var isChecked: Bool = false

    var body: some View {
        Toggle(isOn: $isChecked) {
            renderChildren()
        }
        .toggleStyle(.checkbox)
        .onChange(of: isChecked) { _, newValue in
            runtime.fireEvent(entityId: entity.id, event: "checkedchange", data: newValue ? "true" : "false")
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
    @State private var isOn: Bool = false

    var body: some View {
        Toggle(isOn: $isOn) {
            renderChildren()
        }
        .toggleStyle(.switch)
        .onChange(of: isOn) { _, newValue in
            runtime.fireEvent(entityId: entity.id, event: "checkedchange", data: newValue ? "true" : "false")
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
    @State private var value: Double = 0

    var body: some View {
        let min = entity.props["min"]?.doubleValue ?? 0
        let max = entity.props["max"]?.doubleValue ?? 100
        let step = entity.props["step"]?.doubleValue ?? 1

        SwiftUI.Slider(value: $value, in: min...max, step: step)
            .onChange(of: value) { _, newValue in
                runtime.fireEvent(entityId: entity.id, event: "valuechange", data: String(newValue))
            }
            .applyStyles(entity.styles, runtime: runtime, entity: entity)
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
        let value = entity.props["value"]?.doubleValue ?? 0
        let max = entity.props["max"]?.doubleValue ?? 100
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
