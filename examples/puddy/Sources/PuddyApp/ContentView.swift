import SwiftUI
import Foundation
import JamKit

struct ContentView: View {
    @State private var engine = JamEngineWrapper()
    @State private var debugServer: JamDebugServer?
    @State private var isLoaded = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let error = errorMessage {
                VStack {
                    Text("Error").font(.title).foregroundStyle(.red)
                    Text(error).font(.body).padding()
                    Button("Retry") { loadProgram() }
                }
            } else if isLoaded {
                JamView(engine: engine, rootId: "root")
            } else {
                ProgressView("Loading Puddy...")
            }
        }
        .task {
            loadProgram()
        }
    }

    private func loadProgram() {
        // Load puddy TypeScript files as ES modules
        let tsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("ts")

        do {
            // Files listed with entry point last
            let filePaths = [
                "models/events.ts",
                "models/session.ts",
                "networking/client.ts",
                "networking/session-manager.ts",
                "puddy.tsx",
            ]

            var files: [(path: String, source: String)] = []
            for file in filePaths {
                let path = tsDir.appendingPathComponent(file)
                let source = try String(contentsOf: path, encoding: .utf8)
                files.append((path: file, source: source))
            }

            try engine.loadProgramFiles(name: "puddy", files: files)
            engine.step()
            isLoaded = true

            // Start debug server after loading
            debugServer = JamDebugServer(engine: engine)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
