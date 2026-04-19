import JavaScriptCore
import Observation
import Foundation

/// The Jam runtime — loads JS programs into JavaScriptCore and exposes
/// a reactive entity tree for SwiftUI rendering.
@Observable
public final class JamRuntime {
    /// Current parsed entity tree — drives SwiftUI rendering.
    public private(set) var entities: [String: UIEntity] = [:]

    /// Root entity IDs (children of the "dom" root).
    public private(set) var rootChildren: [(index: Int, id: String)] = []

    /// Callback for native actions dispatched from JS via `callNative(action, params)`.
    /// Called synchronously on the JS queue — dispatch async work if needed.
    /// Return a JSON-serializable value or nil.
    public var onNativeAction: ((_ action: String, _ params: [String: Any]?) -> Any?)? {
        didSet {
            // Re-register the bridge callback when the handler changes
            jsQueue.async { [weak self] in
                self?.registerNativeActionBridge()
            }
        }
    }

    private let jsQueue = DispatchQueue(label: "jam.js", qos: .userInteractive)
    private var context: JSContext!
    private var timerCallbacks: [Int: JSValue] = [:]

    public init() {
        jsQueue.sync {
            self.context = JSContext()!
            self.setupExceptionHandler()
            self.setupPolyfillBridge()
            self.registerNativeActionBridge()
            self.loadBundle()
            self.registerFactsCallback()
        }
    }

    // MARK: - Public API

    /// Load and execute a Jam program (imperative style).
    /// The program source has access to all Jam APIs (insert, when, whenever, h, etc.).
    @discardableResult
    public func loadProgram(id: String, source: String) -> String {
        jsQueue.sync {
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("loadProgram")!
            return fn.call(withArguments: [id, source])?.toString() ?? "error: nil result"
        }
    }

    /// Mount a program that returns a component tree (declarative style).
    /// The source should evaluate to a VNode or component function.
    @discardableResult
    public func mountProgram(id: String, source: String, rootId: String? = nil) -> String {
        jsQueue.sync {
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("mountProgram")!
            var args: [Any] = [id, source]
            if let rootId = rootId { args.append(rootId) }
            return fn.call(withArguments: args)?.toString() ?? "error: nil result"
        }
    }

    /// Dispose a program and drop its emitted facts.
    public func disposeProgram(id: String) {
        jsQueue.async {
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("disposeProgram")!
            fn.call(withArguments: [id])
        }
    }

    /// Fire an event handler on an entity (button press, text change, etc.).
    public func fireEvent(entityId: String, event: String, data: String? = nil) {
        jsQueue.async {
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("fireEvent")!
            if let data = data {
                fn.call(withArguments: [entityId, event, data])
            } else {
                fn.call(withArguments: [entityId, event])
            }
        }
    }

    /// Assert a fact from Swift.
    public func assertFact(_ terms: [Any]) {
        jsQueue.async {
            guard let json = try? JSONSerialization.data(withJSONObject: terms),
                  let str = String(data: json, encoding: .utf8) else { return }
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("assertFact")!
            fn.call(withArguments: [str])
        }
    }

    /// Set (upsert) a fact from Swift.
    public func setFact(_ terms: [Any]) {
        jsQueue.async {
            guard let json = try? JSONSerialization.data(withJSONObject: terms),
                  let str = String(data: json, encoding: .utf8) else { return }
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("setFact")!
            fn.call(withArguments: [str])
        }
    }

    /// Retract a fact from Swift.
    public func removeFact(_ terms: [Any]) {
        jsQueue.async {
            guard let json = try? JSONSerialization.data(withJSONObject: terms),
                  let str = String(data: json, encoding: .utf8) else { return }
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("removeFact")!
            fn.call(withArguments: [str])
        }
    }

    /// Get current facts as a JSON string (synchronous).
    public func getCurrentFacts() -> String {
        jsQueue.sync {
            let jamNative = self.context.objectForKeyedSubscript("JamNative")!
            let fn = jamNative.objectForKeyedSubscript("getCurrentFacts")!
            return fn.call(withArguments: nil)?.toString() ?? "[]"
        }
    }

    // MARK: - Private Setup

    private func setupExceptionHandler() {
        context.exceptionHandler = { _, exception in
            print("[JamNative] JS Error: \(exception?.toString() ?? "unknown")")
        }
    }

    private func setupPolyfillBridge() {
        // setTimeout bridge — dispatches callbacks on the JS queue after a delay
        let scheduleTimeout: @convention(block) (Int, Double, JSValue) -> Void = {
            [weak self] id, ms, callback in
            guard let self = self else { return }
            self.timerCallbacks[id] = callback
            self.jsQueue.asyncAfter(deadline: .now() + ms / 1000.0) { [weak self] in
                guard let self = self,
                      let cb = self.timerCallbacks.removeValue(forKey: id) else { return }
                cb.call(withArguments: nil)
            }
        }
        context.setObject(scheduleTimeout, forKeyedSubscript: "__scheduleTimeout" as NSString)

        let clearTimeout: @convention(block) (Int) -> Void = { [weak self] id in
            self?.timerCallbacks.removeValue(forKey: id)
        }
        context.setObject(clearTimeout, forKeyedSubscript: "__clearTimeout" as NSString)

        // Console bridge
        let consoleLog: @convention(block) (JSValue) -> Void = { value in
            print("[JamNative] \(value.toString() ?? "")")
        }
        let consoleObj = JSValue(newObjectIn: context)!
        consoleObj.setObject(consoleLog, forKeyedSubscript: "log" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "warn" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "error" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "info" as NSString)
        consoleObj.setObject(consoleLog, forKeyedSubscript: "debug" as NSString)
        context.setObject(consoleObj, forKeyedSubscript: "console" as NSString)
    }

    private func registerNativeActionBridge() {
        // Register __callNative as a global function in JSContext.
        // JS calls __callNative(action, paramsJson) → Swift handler → optional return value.
        // This runs synchronously on the JS queue — the handler can dispatch async work.
        let callback: @convention(block) (String, JSValue) -> Any? = { [weak self] action, paramsValue in
            guard let self = self else { return nil }
            var params: [String: Any]? = nil
            if !paramsValue.isUndefined && !paramsValue.isNull {
                if let jsonStr = paramsValue.toString(),
                   let data = jsonStr.data(using: .utf8),
                   let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    params = parsed
                }
            }
            let result = self.onNativeAction?(action, params)
            if let result = result {
                // For simple types (String, Number, Bool), return directly —
                // JSC handles the bridging. For complex types (Array, Dict),
                // serialize to JSON string.
                if result is String || result is NSNumber {
                    return result
                }
                if JSONSerialization.isValidJSONObject(result),
                   let jsonData = try? JSONSerialization.data(withJSONObject: result),
                   let jsonStr = String(data: jsonData, encoding: .utf8) {
                    return jsonStr
                }
                return "\(result)"
            }
            return nil
        }
        context.setObject(callback, forKeyedSubscript: "__callNative" as NSString)
    }

    private func loadBundle() {
        guard let url = Bundle.module.url(forResource: "jam-runtime", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8) else {
            fatalError("[JamNative] Failed to load jam-runtime.js from bundle resources")
        }
        context.evaluateScript(script, withSourceURL: URL(string: "jam-runtime.js"))
    }

    private func registerFactsCallback() {
        // Register the Swift callback as a named global, then pass it to JS.
        // Using context.setObject() is the safe way to bridge @convention(block)
        // closures — avoids unsafeBitCast and ensures proper retain management.
        let callback: @convention(block) (String) -> Void = { [weak self] json in
            guard let self = self,
                  let data = json.data(using: .utf8),
                  let rawFacts = try? JSONSerialization.jsonObject(with: data) as? [[Any]] else {
                return
            }
            let parsed = Self.buildEntityTree(from: rawFacts)
            DispatchQueue.main.async {
                self.entities = parsed.entities
                self.rootChildren = parsed.rootChildren
            }
        }

        // Register as a global so JSC properly retains the block
        context.setObject(callback, forKeyedSubscript: "__factsChangedCallback" as NSString)
        // Pass it to JamNative.onFactsChanged
        context.evaluateScript("JamNative.onFactsChanged(__factsChangedCallback);")
    }

    // MARK: - Entity Tree Builder

    struct EntityTree {
        var entities: [String: UIEntity]
        var rootChildren: [(index: Int, id: String)]
    }

    static func buildEntityTree(from rawFacts: [[Any]]) -> EntityTree {
        var entities: [String: UIEntity] = [:]

        for fact in rawFacts {
            guard fact.count >= 3 else { continue }
            let entityId = "\(fact[0])"
            let attr = "\(fact[1])"

            if entities[entityId] == nil {
                entities[entityId] = UIEntity(id: entityId)
            }

            switch attr {
            case "tag":
                entities[entityId]!.tag = "\(fact[2])"

            case "style":
                guard fact.count >= 4 else { continue }
                let prop = "\(fact[2])"
                entities[entityId]!.styles[prop] = JamTerm(fact[3])

            case "prop":
                guard fact.count >= 4 else { continue }
                let prop = "\(fact[2])"
                entities[entityId]!.props[prop] = JamTerm(fact[3])

            case "class":
                entities[entityId]!.classes.append("\(fact[2])")

            case "text":
                entities[entityId]!.text = "\(fact[2])"

            case "handler":
                guard fact.count >= 4 else { continue }
                entities[entityId]!.handlers.insert("\(fact[2])")

            case "child":
                guard fact.count >= 4 else { continue }
                guard let n = fact[2] as? NSNumber else { continue }
                let index = n.intValue
                let childId = "\(fact[3])"
                entities[entityId]!.children.append((index: index, id: childId))

            default:
                break // Skip non-VDOM facts (tokens, themes, app state, etc.)
            }
        }

        // Sort children by index
        for id in entities.keys {
            entities[id]!.children.sort { $0.index < $1.index }
        }

        let rootChildren = entities["dom"]?.children ?? []
        return EntityTree(entities: entities, rootChildren: rootChildren)
    }
}
