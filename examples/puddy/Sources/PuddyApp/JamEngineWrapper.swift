import Foundation
import Observation

// MARK: - JSON types for Jam data

enum JamTerm: Hashable {
    case symbol(String)
    case int(Int)
    case bool(Bool)
    case null

    var stringValue: String? {
        switch self {
        case .symbol(let s): return s
        case .int(let n): return String(n)
        case .bool(let b): return String(b)
        case .null: return nil
        }
    }

    var intValue: Int? {
        if case .int(let n) = self { return n }
        return nil
    }
}

struct JamStatement: Hashable {
    let terms: [JamTerm]
}

struct JamDelta {
    let statement: JamStatement
    let weight: Int
}

// MARK: - Engine wrapper

@Observable
class JamEngineWrapper {
    private var engine: JamEngine
    private(set) var currentFacts: [JamStatement] = []

    init() {
        self.engine = JamEngine()
    }

    @discardableResult
    func loadProgram(name: String, source: String) throws -> UInt64 {
        let result = engine.load_program(name, source).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.loadFailed(String(result.dropFirst(7)))
        }
        guard let id = UInt64(result) else {
            throw JamError.invalidProgramId(result)
        }
        return id
    }

    func removeProgram(_ id: UInt64) {
        engine.remove_program(id)
    }

    func assertFact(_ terms: [JamTerm]) throws {
        let json = encodeTerms(terms)
        let result = engine.assert_fact_json(json).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.assertFailed(String(result.dropFirst(7)))
        }
    }

    func retractFact(_ terms: [JamTerm]) throws {
        let json = encodeTerms(terms)
        let result = engine.retract_fact_json(json).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.retractFailed(String(result.dropFirst(7)))
        }
    }

    /// Fire an event callback on an entity (e.g., button press).
    /// The Rust side invokes the JS callback, applies hold ops, and steps the engine.
    func fireEvent(entityId: String, eventName: String, data: String? = nil) {
        // TODO: pass data to the callback (e.g., text field value)
        let result = engine.fire_event(entityId, eventName).toString()
        if result.hasPrefix("ERROR: ") {
            print("fireEvent error: \(result)")
        }
        refreshFacts()
    }

    @discardableResult
    func step() -> [JamDelta] {
        let json = engine.step_json().toString()
        let deltas = parseDeltas(json)
        refreshFacts()
        return deltas
    }

    private func refreshFacts() {
        let json = engine.current_facts_json().toString()
        currentFacts = parseFacts(json)
    }

    // MARK: - JSON encoding/decoding

    private func encodeTerms(_ terms: [JamTerm]) -> String {
        var parts: [String] = []
        for term in terms {
            switch term {
            case .symbol(let s):
                let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                parts.append("\"\(escaped)\"")
            case .int(let n):
                parts.append("\(n)")
            case .bool(let b):
                parts.append(b ? "true" : "false")
            case .null:
                parts.append("null")
            }
        }
        return "[\(parts.joined(separator: ","))]"
    }

    private func parseFacts(_ json: String) -> [JamStatement] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[Any]]
        else { return [] }

        return arr.map { terms in
            JamStatement(terms: terms.map(parseTermValue))
        }
    }

    private func parseDeltas(_ json: String) -> [JamDelta] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }

        return arr.compactMap { dict in
            guard let terms = dict["terms"] as? [Any],
                  let weight = dict["weight"] as? Int
            else { return nil }
            return JamDelta(
                statement: JamStatement(terms: terms.map(parseTermValue)),
                weight: weight
            )
        }
    }

    private func parseTermValue(_ value: Any) -> JamTerm {
        if let s = value as? String { return .symbol(s) }
        if let b = value as? Bool { return .bool(b) }
        if let n = value as? NSNumber { return .int(n.intValue) }
        if value is NSNull { return .null }
        return .null
    }
}

enum JamError: Error, LocalizedError {
    case loadFailed(String)
    case invalidProgramId(String)
    case assertFailed(String)
    case retractFailed(String)

    var errorDescription: String? {
        switch self {
        case .loadFailed(let s): return "Load failed: \(s)"
        case .invalidProgramId(let s): return "Invalid program ID: \(s)"
        case .assertFailed(let s): return "Assert failed: \(s)"
        case .retractFailed(let s): return "Retract failed: \(s)"
        }
    }
}
