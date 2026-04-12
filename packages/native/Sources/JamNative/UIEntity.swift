import Foundation

/// A term value from the Jam fact database.
public enum JamTerm: Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)

    public var stringValue: String? {
        if case .string(let s) = self { return s }
        if case .number(let n) = self { return String(n) }
        if case .bool(let b) = self { return String(b) }
        return nil
    }

    public var doubleValue: Double? {
        if case .number(let n) = self { return n }
        if case .string(let s) = self { return Double(s) }
        return nil
    }

    public var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    /// Parse from a JSON-deserialized Any value.
    public init(_ any: Any) {
        if let s = any as? String {
            self = .string(s)
        } else if let n = any as? NSNumber {
            // NSNumber wraps both bools and numbers in Obj-C bridging.
            // CFBooleanGetTypeID check distinguishes them.
            if CFBooleanGetTypeID() == CFGetTypeID(n) {
                self = .bool(n.boolValue)
            } else {
                self = .number(n.doubleValue)
            }
        } else {
            self = .string(String(describing: any))
        }
    }
}

/// A parsed UI entity from VDOM facts in the Jam fact database.
public struct UIEntity: Identifiable, Sendable {
    public let id: String
    public var tag: String = ""
    /// Resolved style values from [id, "style", prop, value] facts.
    public var styles: [String: JamTerm] = [:]
    /// Non-style properties from [id, "prop", prop, value] facts.
    public var props: [String: JamTerm] = [:]
    /// CSS class names from [id, "class", name] facts (web mode only).
    public var classes: [String] = []
    /// Text content from [id, "text", content] facts.
    public var text: String?
    /// Event handler names (click, change, submit, etc.).
    public var handlers: Set<String> = []
    /// Child entities sorted by index.
    public var children: [(index: Int, id: String)] = []

    public init(id: String) {
        self.id = id
    }
}
