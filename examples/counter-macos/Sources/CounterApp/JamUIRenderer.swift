import SwiftUI

// MARK: - Entity model built from claims

struct UIEntity {
    var id: String
    var type: String = ""
    var properties: [String: JamTerm] = [:]
    var children: [(sortKey: String, childId: String)] = []
    var hasOnPress: Bool = false
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
        case "onPress":
            // Boolean marker indicating this entity has a press callback
            entities[entityId]?.hasOnPress = true
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
        case "Text":
            return renderText(entity)
        case "Button":
            return renderButton(entity)
        case "Spacer":
            return AnyView(Spacer())
        default:
            // Typeless entity with children — render children directly (implicit container).
            // This handles the "root" entity which has no isa but parents the tree.
            if !entity.children.isEmpty {
                return renderVStack(entity, entities: entities)
            }
            return AnyView(EmptyView())
        }
    }

    private func renderVStack(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let spacing: CGFloat? = entity.properties["spacing"]?.intValue.map { CGFloat($0) }
        let childViews = resolveChildren(entity, entities: entities)
        return AnyView(
            VStack(spacing: spacing) {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
    }

    private func renderHStack(_ entity: UIEntity, entities: [String: UIEntity]) -> AnyView {
        let spacing: CGFloat? = entity.properties["spacing"]?.intValue.map { CGFloat($0) }
        let childViews = resolveChildren(entity, entities: entities)
        return AnyView(
            HStack(spacing: spacing) {
                ForEach(childViews, id: \.id) { child in
                    child.view
                }
            }
        )
    }

    private func renderText(_ entity: UIEntity) -> AnyView {
        let content = entity.properties["text"]?.stringValue ?? ""
        var text = Text(content)
        if let fontName = entity.properties["font"]?.stringValue {
            text = text.font(swiftUIFont(fontName))
        }
        return AnyView(text)
    }

    private func renderButton(_ entity: UIEntity) -> AnyView {
        let label = entity.properties["label"]?.stringValue ?? ""
        let entityId = entity.id
        let hasCallback = entity.hasOnPress
        return AnyView(
            Button(label) {
                if hasCallback {
                    // Generic event dispatch — no hardcoded action strings
                    engine.fireEvent(entityId: entityId, eventName: "onPress")
                }
            }
            .font(swiftUIFont(entity.properties["font"]?.stringValue))
        )
    }

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
        case "body": return .body
        case "caption": return .caption
        default: return nil
        }
    }
}
