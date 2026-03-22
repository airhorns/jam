import SwiftUI

// MARK: - Entity model built from claims

struct UIEntity {
    var id: String
    var type: String = ""
    var properties: [String: JamTerm] = [:]
    var children: [(sortKey: String, childId: String)] = []
}

// MARK: - Build entity map from facts

func buildEntityMap(from facts: [JamStatement]) -> [String: UIEntity] {
    var entities: [String: UIEntity] = [:]

    for fact in facts {
        let terms = fact.terms
        guard terms.count >= 3,
              let entityId = terms[0].stringValue,
              let predicate = terms[1].stringValue
        else { continue }

        if entities[entityId] == nil {
            entities[entityId] = UIEntity(id: entityId)
        }

        switch predicate {
        case "isa":
            if let typeName = terms[2].stringValue {
                entities[entityId]?.type = typeName
            }
        case "child":
            if terms.count >= 4,
               let sortKey = terms[2].stringValue,
               let childId = terms[3].stringValue {
                entities[entityId]?.children.append((sortKey: sortKey, childId: childId))
            }
        default:
            entities[entityId]?.properties[predicate] = terms[2]
        }
    }

    for key in entities.keys {
        entities[key]?.children.sort { $0.sortKey < $1.sortKey }
    }

    return entities
}

// MARK: - SwiftUI renderer

struct JamView: View {
    let engine: JamEngineWrapper
    let rootId: String

    var body: some View {
        let entities = buildEntityMap(from: engine.currentFacts)
        if let root = entities[rootId] {
            renderEntity(root, entities: entities)
        } else {
            AnyView(Text("No root entity: \(rootId)").foregroundStyle(.secondary))
        }
    }

    func renderEntity(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        switch entity.type {
        case "VStack":
            return renderVStack(entity, entities: entities)
        case "HStack":
            return renderHStack(entity, entities: entities)
        case "ZStack":
            return renderZStack(entity, entities: entities)
        case "Text":
            return renderText(entity)
        case "Button":
            return renderButton(entity)
        case "Spacer":
            return AnyView(Spacer())
        case "ScrollView":
            return renderScrollView(entity, entities: entities)
        case "TextField":
            return renderTextField(entity)
        case "NavigationSplitView":
            return renderNavigationSplitView(entity, entities: entities)
        case "ProgressView":
            return renderProgressView(entity)
        case "Divider":
            return AnyView(Divider())
        case "Circle":
            return renderCircle(entity)
        default:
            if !entity.children.isEmpty {
                return renderVStack(entity, entities: entities)
            }
            return AnyView(EmptyView())
        }
    }

    // MARK: - Layout containers

    private func renderVStack(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let spacing: CGFloat? = entity.properties["spacing"]?.intValue.map { CGFloat($0) }
        let childViews = resolveChildren(entity, entities: entities)
        var view = AnyView(
            VStack(alignment: swiftUIAlignment(entity.properties["alignment"]?.stringValue), spacing: spacing) {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
        if let padding = entity.properties["padding"]?.intValue {
            view = AnyView(view.padding(CGFloat(padding)))
        }
        return view
    }

    private func renderHStack(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let spacing: CGFloat? = entity.properties["spacing"]?.intValue.map { CGFloat($0) }
        let childViews = resolveChildren(entity, entities: entities)
        var view = AnyView(
            HStack(spacing: spacing) {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
        if let padding = entity.properties["padding"]?.intValue {
            view = AnyView(view.padding(CGFloat(padding)))
        }
        return view
    }

    private func renderZStack(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let childViews = resolveChildren(entity, entities: entities)
        var view = AnyView(
            ZStack {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
        if let padding = entity.properties["padding"]?.intValue {
            view = AnyView(view.padding(CGFloat(padding)))
        }
        return view
    }

    private func renderScrollView(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let childViews = resolveChildren(entity, entities: entities)
        var view = AnyView(
            ScrollView {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
        if let padding = entity.properties["padding"]?.intValue {
            view = AnyView(view.padding(CGFloat(padding)))
        }
        return view
    }

    private func renderNavigationSplitView(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let childViews = resolveChildren(entity, entities: entities)
        // First child is sidebar, second is detail
        let sidebar = childViews.first?.view ?? AnyView(EmptyView())
        let detail = childViews.dropFirst().first?.view ?? AnyView(Text("Select an item").foregroundStyle(.secondary))

        return AnyView(
            NavigationSplitView {
                ScrollView {
                    sidebar
                }
            } detail: {
                detail
            }
        )
    }

    // MARK: - Content views

    private func renderText(_ entity: UIEntity) -> AnyView {
        let content = entity.properties["text"]?.stringValue ?? ""
        var text = Text(content)
        if let fontName = entity.properties["font"]?.stringValue {
            text = text.font(swiftUIFont(fontName))
        }
        if let colorName = entity.properties["foregroundColor"]?.stringValue {
            return AnyView(text.foregroundStyle(swiftUIColor(colorName)))
        }
        return AnyView(text)
    }

    private func renderButton(_ entity: UIEntity) -> AnyView {
        let label = entity.properties["label"]?.stringValue ?? ""
        let entityId = entity.id
        // Check for any callback property (onPress is the most common)
        let hasCallback = entity.properties.values.contains { term in
            if case .symbol(let s) = term, s.contains(":") { return true }
            return false
        }
        var view = AnyView(
            Button(label) {
                if hasCallback {
                    engine.fireEvent(entityId: entityId, eventName: "onPress")
                }
            }
        )
        if let fontName = entity.properties["font"]?.stringValue {
            view = AnyView(view.font(swiftUIFont(fontName)))
        }
        if let colorName = entity.properties["foregroundColor"]?.stringValue {
            view = AnyView(view.foregroundStyle(swiftUIColor(colorName)))
        }
        return view
    }

    private func renderTextField(_ entity: UIEntity) -> AnyView {
        let placeholder = entity.properties["placeholder"]?.stringValue ?? ""
        let entityId = entity.id

        return AnyView(
            TextFieldView(
                placeholder: placeholder,
                font: swiftUIFont(entity.properties["font"]?.stringValue),
                onSubmit: { text in
                    engine.fireEvent(entityId: entityId, eventName: "onSubmit", data: text)
                }
            )
        )
    }

    private func renderProgressView(_ entity: UIEntity) -> AnyView {
        if let label = entity.properties["label"]?.stringValue {
            return AnyView(ProgressView(label))
        }
        return AnyView(ProgressView())
    }

    private func renderCircle(_ entity: UIEntity) -> AnyView {
        let size = entity.properties["frame"]?.intValue ?? 10
        var view = AnyView(
            SwiftUI.Circle()
                .frame(width: CGFloat(size), height: CGFloat(size))
        )
        if let colorName = entity.properties["foregroundColor"]?.stringValue {
            view = AnyView(
                SwiftUI.Circle()
                    .fill(swiftUIColor(colorName))
                    .frame(width: CGFloat(size), height: CGFloat(size))
            )
        }
        return view
    }

    // MARK: - Helpers

    private struct IdentifiedView: Identifiable {
        let id: String
        let view: AnyView
    }

    private func resolveChildren(_ entity: UIEntity, entities: [String: UIEntity]) -> [IdentifiedView] {
        entity.children.compactMap { child in
            guard let childEntity = entities[child.childId] else { return nil }
            return IdentifiedView(id: child.childId, view: renderEntity(childEntity, entities: entities))
        }
    }

    private func swiftUIFont(_ name: String?) -> Font? {
        switch name {
        case "largeTitle": return .largeTitle
        case "title": return .title
        case "title2": return .title2
        case "title3": return .title3
        case "headline": return .headline
        case "subheadline": return .subheadline
        case "body": return .body
        case "callout": return .callout
        case "footnote": return .footnote
        case "caption": return .caption
        case "caption2": return .caption2
        default: return nil
        }
    }

    private func swiftUIColor(_ name: String) -> Color {
        switch name {
        case "red": return .red
        case "blue": return .blue
        case "green": return .green
        case "orange": return .orange
        case "purple": return .purple
        case "gray", "grey": return .gray
        case "white": return .white
        case "black": return .black
        case "yellow": return .yellow
        case "pink": return .pink
        case "primary": return .primary
        case "secondary": return .secondary
        default: return .primary
        }
    }

    private func swiftUIAlignment(_ name: String?) -> HorizontalAlignment {
        switch name {
        case "leading": return .leading
        case "trailing": return .trailing
        case "center": return .center
        default: return .center
        }
    }
}

// MARK: - TextField with local state

struct TextFieldView: View {
    let placeholder: String
    let font: Font?
    let onSubmit: (String) -> Void

    @State private var text = ""

    var body: some View {
        SwiftUI.TextField(placeholder, text: $text)
            .font(font)
            .onSubmit {
                let submitted = text
                text = ""
                onSubmit(submitted)
            }
            .textFieldStyle(.roundedBorder)
    }
}
