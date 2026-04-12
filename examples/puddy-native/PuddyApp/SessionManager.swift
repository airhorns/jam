import Foundation
import JamNative

/// Swift-side session manager — handles HTTP networking and SSE streaming
/// that can't run in JSC (no fetch API). Receives action callbacks from JS
/// via JamRuntime.onNativeAction (no polling).
final class SessionManager {
    let runtime: JamRuntime
    let baseURL: String
    private var sseTasks: [String: Task<Void, Never>] = [:]
    private var nextMsgId = 0

    init(runtime: JamRuntime, baseURL: String = "") {
        self.runtime = runtime
        self.baseURL = baseURL

        // Register the native action handler — JS calls callNative("action", {params})
        // which synchronously invokes this closure on the JS queue.
        runtime.onNativeAction = { [weak self] action, params in
            self?.handleNativeAction(action, params: params)
        }
    }

    /// Handle actions dispatched from JS via callNative().
    private func handleNativeAction(_ action: String, params: [String: Any]?) -> Any? {
        switch action {
        case "createSession":
            createSession()
            return nil

        case "sendMessage":
            let sessionId = params?["sessionId"] as? String ?? ""
            let text = params?["text"] as? String ?? ""
            if !sessionId.isEmpty && !text.isEmpty {
                sendMessage(sessionId, text)
            }
            return nil

        case "destroySession":
            let sessionId = params?["sessionId"] as? String ?? ""
            if !sessionId.isEmpty {
                Task { await destroySession(sessionId) }
            }
            return nil

        default:
            print("[Puddy] Unknown native action: \(action)")
            return nil
        }
    }

    // MARK: - Connection

    func checkConnection() {
        Task {
            do {
                let url = URL(string: "\(baseURL)/v1/health")!
                let (_, response) = try await URLSession.shared.data(from: url)
                let httpResponse = response as? HTTPURLResponse
                if httpResponse?.statusCode == 200 {
                    runtime.loadProgram(id: "connection-update", source: """
                        set("connection", "status", "connected");
                    """)
                    await fetchAgents()
                } else {
                    runtime.loadProgram(id: "connection-update", source: """
                        set("connection", "status", "disconnected");
                    """)
                }
            } catch {
                runtime.loadProgram(id: "connection-update", source: """
                    set("connection", "status", "disconnected");
                """)
            }
        }
    }

    private func fetchAgents() async {
        do {
            let url = URL(string: "\(baseURL)/v1/agents")!
            let (data, _) = try await URLSession.shared.data(from: url)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let agents = json["agents"] as? [[String: Any]],
               let first = agents.first(where: {
                   ($0["installed"] as? Bool) == true &&
                   ($0["credentialsAvailable"] as? Bool) == true
               }),
               let agentId = first["id"] as? String {
                runtime.loadProgram(id: "agent-update", source: """
                    set("connection", "agentId", "\(agentId)");
                """)
            }
        } catch {
            print("[Puddy] Failed to fetch agents: \(error)")
        }
    }

    // MARK: - Session Lifecycle

    func createSession() {
        let sessionId = "s-\(Int(Date().timeIntervalSince1970 * 1000))"

        runtime.loadProgram(id: "create-session-\(sessionId)", source: """
            var agentMatches = when(["connection", "agentId", $.id]);
            var agentId = agentMatches.length > 0 ? agentMatches[0].id : "unknown";
            assert("session", "\(sessionId)", "agent", agentId);
            assert("session", "\(sessionId)", "status", "starting");
            set("ui", "selectedSession", "\(sessionId)");
        """)

        Task { await connectSession(sessionId) }
    }

    private func connectSession(_ sessionId: String) async {
        let facts = runtime.getCurrentFacts()
        let agentId = extractFactValue(from: facts, entity: "connection", attr: "agentId") ?? "unknown"

        do {
            let url = URL(string: "\(baseURL)/v1/acp/\(sessionId)?agent=\(agentId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let rpcBody: [String: Any] = [
                "jsonrpc": "2.0", "id": 1,
                "method": "session/new",
                "params": ["cwd": "/", "mcpServers": [Any]()]
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: rpcBody)

            let (_, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                setStatus(sessionId, "failed")
                return
            }

            setStatus(sessionId, "active")
            startEventStream(sessionId)
        } catch {
            setStatus(sessionId, "failed")
        }
    }

    func sendMessage(_ sessionId: String, _ text: String) {
        let msgId = "umsg-\(nextMsgId)"
        nextMsgId += 1
        let escaped = escapeJS(text)

        runtime.loadProgram(id: "send-msg-\(msgId)", source: """
            assert("message", "\(sessionId)", "\(msgId)", "user", "text", "\(escaped)");
            assert("session", "\(sessionId)", "thinking", "true");
        """)

        Task {
            let url = URL(string: "\(baseURL)/v1/acp/\(sessionId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let rpcBody: [String: Any] = [
                "jsonrpc": "2.0", "id": 2,
                "method": "session/prompt",
                "params": ["prompt": [["type": "text", "text": text]]]
            ]
            request.httpBody = try? JSONSerialization.data(withJSONObject: rpcBody)

            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                if (response as? HTTPURLResponse)?.statusCode != 200 {
                    print("[Puddy] sendMessage failed")
                }
            } catch {
                print("[Puddy] sendMessage error: \(error)")
            }
        }
    }

    func destroySession(_ id: String) async {
        sseTasks[id]?.cancel()
        sseTasks.removeValue(forKey: id)
        try? await URLSession.shared.data(for: URLRequest(url: URL(string: "\(baseURL)/v1/acp/\(id)")!))
    }

    // MARK: - SSE Event Stream

    private func startEventStream(_ sessionId: String) {
        sseTasks[sessionId]?.cancel()

        let task = Task {
            let url = URL(string: "\(baseURL)/v1/acp/\(sessionId)")!
            var request = URLRequest(url: url)
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

            do {
                let (bytes, _) = try await URLSession.shared.bytes(for: request)
                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    guard line.hasPrefix("data: ") else { continue }
                    let data = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                    if data.isEmpty { continue }
                    handleSSEData(sessionId, data)
                }
            } catch {
                if !Task.isCancelled {
                    print("[Puddy] SSE error for \(sessionId): \(error)")
                }
            }
        }
        sseTasks[sessionId] = task
    }

    private func handleSSEData(_ sessionId: String, _ data: String) {
        guard let jsonData = data.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else { return }

        if json["error"] != nil { return }

        // Session end
        if json["id"] != nil, let result = json["result"] as? [String: Any],
           let stopReason = result["stopReason"] as? String {
            finalizeStreaming(sessionId)
            setStatus(sessionId, "ended")
            runtime.loadProgram(id: "session-end-\(sessionId)", source: """
                assert("session", "\(sessionId)", "statusDetail", "\(escapeJS(stopReason))");
                retract("session", "\(sessionId)", "hasActiveTools", "true");
            """)
            return
        }

        guard let params = json["params"] as? [String: Any],
              let update = params["update"] as? [String: Any],
              let sessionUpdate = update["sessionUpdate"] as? String else { return }

        let msgId = "msg-\(nextMsgId)"
        nextMsgId += 1

        switch sessionUpdate {
        case "agent_message_chunk":
            let text = (update["content"] as? [String: Any])?["text"] as? String ?? ""
            let escaped = escapeJS(text)
            runtime.loadProgram(id: "chunk-\(msgId)", source: """
                retract("session", "\(sessionId)", "thinking", "true");
                var old = when(["session", "\(sessionId)", "streamingText", $.t]);
                if (old.length > 0) retract("session", "\(sessionId)", "streamingText", old[0].t);
                var prev = old.length > 0 ? old[0].t : "";
                assert("session", "\(sessionId)", "streamingText", prev + "\(escaped)");
            """)

        case "agent_thought_chunk":
            let text = (update["content"] as? [String: Any])?["text"] as? String ?? ""
            let escaped = escapeJS(text)
            runtime.loadProgram(id: "thought-\(msgId)", source: """
                retract("session", "\(sessionId)", "thinking", "true");
                var old = when(["session", "\(sessionId)", "streamingThought", $.t]);
                if (old.length > 0) retract("session", "\(sessionId)", "streamingThought", old[0].t);
                var prev = old.length > 0 ? old[0].t : "";
                assert("session", "\(sessionId)", "streamingThought", prev + "\(escaped)");
            """)

        case "tool_call":
            let toolCallId = update["toolCallId"] as? String ?? msgId
            let title = escapeJS(update["title"] as? String ?? "Unknown tool")
            finalizeStreaming(sessionId)
            runtime.loadProgram(id: "tool-\(msgId)", source: """
                assert("message", "\(sessionId)", "\(toolCallId)", "assistant", "toolUse", "\(title)");
                assert("session", "\(sessionId)", "hasActiveTools", "true");
            """)

        case "tool_call_update":
            let toolCallId = update["toolCallId"] as? String ?? ""
            let status = update["status"] as? String ?? "in_progress"
            if status == "completed" || status == "failed" {
                runtime.loadProgram(id: "toolresult-\(msgId)", source: """
                    assert("message", "\(sessionId)", "\(toolCallId)-result", "tool", "toolResult", "\(status)");
                """)
            }

        case "plan":
            if let entries = update["entries"] as? [[String: Any]] {
                var source = "transaction(function() {\n"
                source += "  retract(\"plan\", \"\(sessionId)\", _, _, _, _);\n"
                for (i, entry) in entries.enumerated() {
                    let content = escapeJS(entry["content"] as? String ?? "")
                    let estatus = entry["status"] as? String ?? "pending"
                    let priority = entry["priority"] as? String ?? "medium"
                    source += "  assert(\"plan\", \"\(sessionId)\", \"entry-\(i)\", \"\(content)\", \"\(estatus)\", \"\(priority)\");\n"
                }
                source += "});"
                runtime.loadProgram(id: "plan-\(msgId)", source: source)
            }

        case "session_info_update":
            if let title = update["title"] as? String {
                runtime.loadProgram(id: "info-\(msgId)", source: """
                    set("session", "\(sessionId)", "title", "\(escapeJS(title))");
                """)
            }

        case "current_mode_update":
            let modeId = update["modeId"] as? String ?? update["currentModeId"] as? String ?? ""
            runtime.loadProgram(id: "mode-\(msgId)", source: """
                set("session", "\(sessionId)", "currentMode", "\(modeId)");
            """)

        default:
            break
        }
    }

    // MARK: - Helpers

    private func setStatus(_ sessionId: String, _ status: String) {
        runtime.loadProgram(id: "status-\(sessionId)-\(status)", source: """
            var old = when(["session", "\(sessionId)", "status", $.s]);
            if (old.length > 0) retract("session", "\(sessionId)", "status", old[0].s);
            assert("session", "\(sessionId)", "status", "\(status)");
        """)
    }

    private func finalizeStreaming(_ sessionId: String) {
        runtime.loadProgram(id: "finalize-\(sessionId)-\(nextMsgId)", source: """
            retract("session", "\(sessionId)", "thinking", "true");
            var streamText = when(["session", "\(sessionId)", "streamingText", $.t]);
            if (streamText.length > 0) {
                retract("session", "\(sessionId)", "streamingText", streamText[0].t);
                assert("message", "\(sessionId)", "msg-finalized-\(nextMsgId)", "assistant", "text", streamText[0].t);
            }
            var streamThought = when(["session", "\(sessionId)", "streamingThought", $.t]);
            if (streamThought.length > 0) {
                retract("session", "\(sessionId)", "streamingThought", streamThought[0].t);
                assert("message", "\(sessionId)", "thought-finalized-\(nextMsgId)", "assistant", "thought", streamThought[0].t);
            }
        """)
    }

    private func extractFactValue(from factsJson: String, entity: String, attr: String) -> String? {
        guard let data = factsJson.data(using: .utf8),
              let facts = try? JSONSerialization.jsonObject(with: data) as? [[Any]] else { return nil }
        for fact in facts {
            if fact.count >= 3, "\(fact[0])" == entity, "\(fact[1])" == attr {
                return "\(fact[2])"
            }
        }
        return nil
    }

    private func escapeJS(_ str: String) -> String {
        str.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\t", with: "\\t")
    }
}
