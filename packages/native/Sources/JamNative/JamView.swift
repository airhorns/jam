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
        case "YStack", "Stack":
            let spacing = entity.styles["gap"]?.doubleValue
            let alignment = mapHAlignment(entity.styles["alignItems"]?.stringValue)
            VStack(alignment: alignment, spacing: spacing.map { CGFloat($0) }) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)

        case "XStack":
            let spacing = entity.styles["gap"]?.doubleValue
            let alignment = mapVAlignment(entity.styles["alignItems"]?.stringValue)
            HStack(alignment: alignment, spacing: spacing.map { CGFloat($0) }) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)

        case "ZStack":
            ZStack {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)

        case "Text", "SizableText", "Paragraph", "Heading",
             "H1", "H2", "H3", "H4", "H5", "H6":
            renderText(entity)

        case "__text":
            if let text = entity.text {
                Text(text)
            }

        case "Button":
            Button(action: {
                runtime.fireEvent(entityId: entity.id, event: "click")
            }) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)

        case "Input":
            JamTextField(entity: entity, runtime: runtime)

        case "Separator":
            Divider()
                .applyStyles(entity.styles)

        case "Spacer":
            Spacer()

        case "ScrollView":
            let horizontal = entity.styles["flexDirection"]?.stringValue == "row"
            ScrollView(horizontal ? .horizontal : .vertical) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)

        case "Spinner":
            ProgressView()
                .applyStyles(entity.styles)

        default:
            // Unknown component — render as VStack with children
            VStack(alignment: .leading) {
                renderChildren(entity)
            }
            .applyStyles(entity.styles)
        }
    }

    @ViewBuilder
    func renderChildren(_ entity: UIEntity) -> some View {
        ForEach(entity.children, id: \.id) { child in
            EntityView(entityId: child.id, runtime: runtime)
        }
    }

    @ViewBuilder
    func renderText(_ entity: UIEntity) -> some View {
        let textContent = collectTextContent(entity)
        Text(textContent)
            .applyTextStyles(entity.styles)
            .applyStyles(entity.styles)
    }

    /// Recursively collect text from __text children.
    func collectTextContent(_ entity: UIEntity) -> String {
        if let text = entity.text { return text }
        return entity.children.compactMap { child in
            guard let childEntity = runtime.entities[child.id] else { return nil }
            return collectTextContent(childEntity)
        }.joined()
    }
}

/// TextField wrapper for Input entities with local state.
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
        .applyStyles(entity.styles)
    }
}
