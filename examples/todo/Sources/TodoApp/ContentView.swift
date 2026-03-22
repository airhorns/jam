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
                ProgressView("Loading Todo...")
            }
        }
        .task {
            loadProgram()
        }
    }

    private func loadProgram() {
        let tsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("ts")

        do {
            let todoFile = tsDir.appendingPathComponent("todo.tsx")
            let source = try String(contentsOf: todoFile, encoding: .utf8)
            try engine.loadProgram(name: "todo.tsx", source: source)
            engine.step()
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
