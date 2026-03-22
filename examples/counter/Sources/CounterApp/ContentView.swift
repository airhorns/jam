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
                }
            } else if isLoaded {
                JamView(engine: engine, rootId: "root")
                    .padding(40)
            } else {
                ProgressView("Loading Jam...")
            }
        }
        .frame(minWidth: 300, minHeight: 200)
        .task {
            loadProgram()
        }
    }

    private func loadProgram() {
        // Read the counter program from disk
        let tsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("ts")
        let counterFile = tsDir.appendingPathComponent("counter.tsx")

        do {
            let source = try String(contentsOf: counterFile, encoding: .utf8)
            try engine.loadProgram(name: "counter.tsx", source: source)
            engine.step()
            isLoaded = true

            // Start debug server after loading
            debugServer = JamDebugServer(engine: engine)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
