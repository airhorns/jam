import Foundation
#if canImport(AppKit)
import AppKit
#endif

/// A debug server that listens on a Unix domain socket and provides
/// introspection into a running Jam app. Automatically starts on init.
///
/// Socket path: /tmp/jam-debug-{pid}.sock
///
/// Protocol: line-based JSON over Unix socket. Send a JSON command
/// terminated by newline, receive a JSON response terminated by newline.
///
/// Commands:
///   {"cmd": "facts"}                              → all current facts as JSON
///   {"cmd": "tree"}                               → formatted entity tree
///   {"cmd": "fire", "callbackId": "entity:event"} → fire a callback
///   {"cmd": "fire", "entityId": "id", "event": "onPress"}
///   {"cmd": "fire", "entityId": "id", "event": "onSubmit", "data": "text"}
///   {"cmd": "screenshot"}                         → capture window as base64 PNG
///   {"cmd": "screenshot", "path": "/tmp/out.png"} → save screenshot to file
///   {"cmd": "ping"}                               → health check
///
@Observable
public class JamDebugServer {
    public let socketPath: String
    private weak var engine: JamEngineWrapper?
    private var serverFd: Int32 = -1
    private var running = false
    private var acceptSource: DispatchSourceRead?

    public init(engine: JamEngineWrapper) {
        let pid = ProcessInfo.processInfo.processIdentifier
        self.socketPath = "/tmp/jam-debug-\(pid).sock"
        self.engine = engine
        start()
    }

    deinit {
        stop()
    }

    private func start() {
        // Remove stale socket file
        unlink(socketPath)

        // Create Unix domain socket
        serverFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverFd >= 0 else {
            print("[JamDebug] Failed to create socket: \(String(cString: strerror(errno)))")
            return
        }

        // Bind to path
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        guard pathBytes.count <= MemoryLayout.size(ofValue: addr.sun_path) else {
            print("[JamDebug] Socket path too long")
            close(serverFd)
            serverFd = -1
            return
        }
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: pathBytes.count) { dest in
                for (i, byte) in pathBytes.enumerated() {
                    dest[i] = byte
                }
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                bind(serverFd, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            print("[JamDebug] Failed to bind: \(String(cString: strerror(errno)))")
            close(serverFd)
            serverFd = -1
            return
        }

        // Listen
        guard listen(serverFd, 5) == 0 else {
            print("[JamDebug] Failed to listen: \(String(cString: strerror(errno)))")
            close(serverFd)
            serverFd = -1
            return
        }

        // Set non-blocking
        let flags = fcntl(serverFd, F_GETFL)
        fcntl(serverFd, F_SETFL, flags | O_NONBLOCK)

        running = true
        print("[JamDebug] Listening on \(socketPath)")

        // Use GCD to accept connections on the main queue
        let source = DispatchSource.makeReadSource(fileDescriptor: serverFd, queue: .main)
        source.setEventHandler { [weak self] in
            self?.acceptConnection()
        }
        source.setCancelHandler { [weak self] in
            if let fd = self?.serverFd, fd >= 0 {
                close(fd)
                self?.serverFd = -1
            }
        }
        source.resume()
        acceptSource = source
    }

    private func stop() {
        running = false
        acceptSource?.cancel()
        acceptSource = nil
        if serverFd >= 0 {
            close(serverFd)
            serverFd = -1
        }
        unlink(socketPath)
    }

    private func acceptConnection() {
        var clientAddr = sockaddr_un()
        var addrLen = socklen_t(MemoryLayout<sockaddr_un>.size)
        let clientFd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                accept(serverFd, sockPtr, &addrLen)
            }
        }
        guard clientFd >= 0 else { return }

        // Handle client on a background queue, dispatch commands to main
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.handleClient(fd: clientFd)
        }
    }

    private func handleClient(fd: Int32) {
        defer { close(fd) }

        var buffer = Data()
        let readBuf = UnsafeMutablePointer<UInt8>.allocate(capacity: 65536)
        defer { readBuf.deallocate() }

        while running {
            let bytesRead = read(fd, readBuf, 65536)
            if bytesRead <= 0 { break }
            buffer.append(readBuf, count: bytesRead)

            // Process complete lines
            while let newlineRange = buffer.range(of: Data([0x0A])) {
                let lineData = buffer.subdata(in: 0..<newlineRange.lowerBound)
                buffer.removeSubrange(0...newlineRange.lowerBound)

                guard let line = String(data: lineData, encoding: .utf8),
                      !line.trimmingCharacters(in: .whitespaces).isEmpty
                else { continue }

                // Dispatch to main thread for engine access
                var response: [String: Any] = [:]
                let semaphore = DispatchSemaphore(value: 0)
                DispatchQueue.main.async { [weak self] in
                    response = self?.handleCommand(line) ?? ["error": "server gone"]
                    semaphore.signal()
                }
                semaphore.wait()

                // Send response
                if let responseData = try? JSONSerialization.data(withJSONObject: response),
                   var responseStr = String(data: responseData, encoding: .utf8) {
                    responseStr += "\n"
                    if let bytes = responseStr.data(using: .utf8) {
                        bytes.withUnsafeBytes { ptr in
                            _ = write(fd, ptr.baseAddress!, bytes.count)
                        }
                    }
                }
            }
        }
    }

    private func handleCommand(_ json: String) -> [String: Any] {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cmd = obj["cmd"] as? String
        else {
            return ["error": "invalid command JSON"]
        }

        guard let engine = engine else {
            return ["error": "engine deallocated"]
        }

        switch cmd {
        case "facts":
            return handleFacts(engine)
        case "tree":
            return handleTree(engine)
        case "fire":
            return handleFire(obj, engine: engine)
        case "screenshot":
            return handleScreenshot(obj)
        case "ping":
            return ["ok": true, "pid": ProcessInfo.processInfo.processIdentifier,
                    "socket": socketPath]
        default:
            return ["error": "unknown command: \(cmd)"]
        }
    }

    // MARK: - Command handlers

    private func handleFacts(_ engine: JamEngineWrapper) -> [String: Any] {
        let json = engine.currentFactsJson()
        if let data = json.data(using: .utf8),
           let facts = try? JSONSerialization.jsonObject(with: data) {
            return ["ok": true, "facts": facts]
        }
        return ["ok": true, "facts": [], "raw": json]
    }

    private func handleTree(_ engine: JamEngineWrapper) -> [String: Any] {
        let entities = buildEntityMap(from: engine.currentFacts)
        let tree = formatEntityTree(entities: entities, id: "root", indent: 0)
        return ["ok": true, "tree": tree]
    }

    private func handleFire(_ obj: [String: Any], engine: JamEngineWrapper) -> [String: Any] {
        if let callbackId = obj["callbackId"] as? String {
            let parts = callbackId.split(separator: ":", maxSplits: 1)
            if parts.count == 2 {
                engine.fireEvent(entityId: String(parts[0]), eventName: String(parts[1]),
                               data: obj["data"] as? String)
                return ["ok": true]
            }
            return ["error": "invalid callbackId format, expected 'entityId:eventName'"]
        }

        if let entityId = obj["entityId"] as? String,
           let event = obj["event"] as? String {
            engine.fireEvent(entityId: entityId, eventName: event,
                           data: obj["data"] as? String)
            return ["ok": true]
        }

        return ["error": "fire requires 'callbackId' or 'entityId'+'event'"]
    }

    private func handleScreenshot(_ obj: [String: Any]) -> [String: Any] {
        #if canImport(AppKit)
        guard let window = NSApplication.shared.windows.first(where: { $0.isVisible }) else {
            return ["error": "no visible window"]
        }

        let windowId = CGWindowID(window.windowNumber)
        guard let cgImage = CGWindowListCreateImage(
            .null,
            .optionIncludingWindow,
            windowId,
            [.boundsIgnoreFraming]
        ) else {
            return ["error": "failed to capture window"]
        }

        let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
        guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
            return ["error": "failed to encode PNG"]
        }

        // If a path is provided, save to file instead of returning base64
        if let path = obj["path"] as? String {
            do {
                try pngData.write(to: URL(fileURLWithPath: path))
                return ["ok": true, "path": path, "width": cgImage.width, "height": cgImage.height]
            } catch {
                return ["error": "failed to write file: \(error.localizedDescription)"]
            }
        }

        let base64 = pngData.base64EncodedString()
        return ["ok": true, "format": "png", "base64": base64,
                "width": cgImage.width, "height": cgImage.height]
        #else
        return ["error": "screenshots not supported on this platform"]
        #endif
    }

    // MARK: - Entity tree formatting

    private func formatEntityTree(entities: [String: UIEntity], id: String, indent: Int) -> String {
        guard let entity = entities[id] else {
            return String(repeating: " ", count: indent) + "[missing: \(id)]\n"
        }

        let prefix = String(repeating: " ", count: indent)
        let typeName = entity.type.isEmpty ? "?" : entity.type
        var line = "\(prefix)<\(typeName) id=\"\(id)\""

        for (k, v) in entity.properties.sorted(by: { $0.key < $1.key }) {
            let value = v.stringValue ?? "nil"
            if value.contains(":") && (k == "onPress" || k == "onSubmit" || k == "onChange") {
                line += " \(k)=[callback]"
            } else {
                line += " \(k)=\"\(value)\""
            }
        }

        if entity.children.isEmpty {
            return line + " />\n"
        }

        var output = line + ">\n"
        for (_, childId) in entity.children {
            output += formatEntityTree(entities: entities, id: childId, indent: indent + 2)
        }
        output += "\(prefix)</\(typeName)>\n"
        return output
    }
}
