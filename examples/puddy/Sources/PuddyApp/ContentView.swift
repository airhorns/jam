import SwiftUI
import Foundation

struct ContentView: View {
    @State private var engine = JamEngineWrapper()
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
        // Read and concatenate all puddy TypeScript files
        let tsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("ts")

        do {
            let files = [
                "models/events.ts",
                "models/session.ts",
                "networking/client.ts",
                "networking/session-manager.ts",
                "components/ConversationItem.tsx",
                "components/SessionList.tsx",
                "components/SessionDetail.tsx",
                "components/ConnectionStatus.tsx",
                "puddy.tsx",
            ]

            var combined = ""
            for file in files {
                let path = tsDir.appendingPathComponent(file)
                let source = try String(contentsOf: path, encoding: .utf8)
                combined += source + "\n"
            }

            // Use .tsx extension so JSX transpilation is enabled
            try engine.loadProgram(name: "puddy.tsx", source: combined)
            engine.step()
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
