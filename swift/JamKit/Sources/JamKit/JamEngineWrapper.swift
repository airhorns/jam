import Foundation
import Observation

// MARK: - JSON types for Jam data

public enum JamTerm: Hashable {
    case symbol(String)
    case int(Int)
    case bool(Bool)
    case null

    public var stringValue: String? {
        switch self {
        case .symbol(let s): return s
        case .int(let n): return String(n)
        case .bool(let b): return String(b)
        case .null: return nil
        }
    }

    public var intValue: Int? {
        if case .int(let n) = self { return n }
        return nil
    }
}

public struct JamStatement: Hashable {
    public let terms: [JamTerm]
    public init(terms: [JamTerm]) { self.terms = terms }
}

public struct JamDelta {
    public let statement: JamStatement
    public let weight: Int
}

// MARK: - Engine wrapper

@Observable
public class JamEngineWrapper {
    private var engine: JamEngine
    public private(set) var currentFacts: [JamStatement] = []

    public init() {
        self.engine = JamEngine()
    }

    /// Start polling for async JS work (fetch completions, etc.).
    /// Polls every 50ms on the main thread; stops when idle.
    private func startAsyncPoll() {
        guard !isPollingAsync else { return }
        isPollingAsync = true
        pollAsyncOnce()
    }

    private var isPollingAsync = false

    private func pollAsyncOnce() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self, isPollingAsync else { return }
            let result = engine.drain_async().toString()
            refreshFacts()
            if result == "IDLE" {
                isPollingAsync = false
            } else {
                pollAsyncOnce()
            }
        }
    }

    @discardableResult
    public func loadProgram(name: String, source: String) throws -> UInt64 {
        let result = engine.load_program(name, source).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.loadFailed(String(result.dropFirst(7)))
        }
        guard let id = UInt64(result) else {
            throw JamError.invalidProgramId(result)
        }
        return id
    }

    public func removeProgram(_ id: UInt64) {
        engine.remove_program(id)
    }

    public func assertFact(_ terms: [JamTerm]) throws {
        let json = encodeTerms(terms)
        let result = engine.assert_fact_json(json).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.assertFailed(String(result.dropFirst(7)))
        }
    }

    public func retractFact(_ terms: [JamTerm]) throws {
        let json = encodeTerms(terms)
        let result = engine.retract_fact_json(json).toString()
        if result.hasPrefix("ERROR: ") {
            throw JamError.retractFailed(String(result.dropFirst(7)))
        }
    }

    /// Fire an event callback on an entity (e.g., button press).
    /// The Rust side invokes the JS callback, applies hold ops, and steps the engine.
    /// Any async work (fetch, etc.) started by the callback is drained by the async
    /// poll timer — no blocking on the main thread.
    public func fireEvent(entityId: String, eventName: String, data: String? = nil) {
        let result: String
        if let data = data {
            result = engine.fire_event_with_data(entityId, eventName, data).toString()
        } else {
            result = engine.fire_event(entityId, eventName).toString()
        }
        if result.hasPrefix("ERROR: ") {
            print("fireEvent error: \(result)")
        }
        refreshFacts()
        print("[JamKit] fireEvent done, starting async poll")
        startAsyncPoll()
    }

    /// Evaluate arbitrary JS/TS code in the engine context.
    @discardableResult
    public func evalJS(_ code: String) -> String {
        let result = engine.eval_js_ffi(code).toString()
        refreshFacts()
        return result
    }

    @discardableResult
    public func step() -> [JamDelta] {
        let json = engine.step_json().toString()
        let deltas = parseDeltas(json)
        refreshFacts()
        return deltas
    }

    /// Returns the raw JSON string of current facts (for debug server).
    public func currentFactsJson() -> String {
        return engine.current_facts_json().toString()
    }

    private func refreshFacts() {
        let json = currentFactsJson()
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

public enum JamError: Error, LocalizedError {
    case loadFailed(String)
    case invalidProgramId(String)
    case assertFailed(String)
    case retractFailed(String)

    public var errorDescription: String? {
        switch self {
        case .loadFailed(let s): return "Load failed: \(s)"
        case .invalidProgramId(let s): return "Invalid program ID: \(s)"
        case .assertFailed(let s): return "Assert failed: \(s)"
        case .retractFailed(let s): return "Retract failed: \(s)"
        }
    }
}
