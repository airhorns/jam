import SwiftUI

struct ContentView: View {
    @State private var engine = JamEngineWrapper()
    @State private var isLoaded = false
    @State private var errorMessage: String?
    @State private var counter = 0

    // The counter program source using JSX syntax
    private let counterSource = """
    render(
        <VStack key="app">
            <Text key="title" font="title">Jam Counter</Text>
            {when(["counter", "count", $.value], ({ value }) =>
                <Text key="display" font="largeTitle">{"Count: " + value}</Text>
            )}
            <HStack key="buttons">
                <Button key="dec" label="-" />
                <Button key="inc" label="+" />
            </HStack>
        </VStack>
    );
    """

    var body: some View {
        Group {
            if let error = errorMessage {
                VStack {
                    Text("Error").font(.title).foregroundStyle(.red)
                    Text(error).font(.body).padding()
                }
            } else if isLoaded {
                JamView(engine: engine, rootId: "root") { action in
                    handleAction(action)
                }
                .padding(40)
            } else {
                ProgressView("Loading Jam...")
            }
        }
        .frame(minWidth: 300, minHeight: 200)
        .task {
            loadCounter()
        }
    }

    private func loadCounter() {
        do {
            // Use .tsx extension to enable JSX transpilation
            try engine.loadProgram(name: "counter.tsx", source: counterSource)
            // Assert initial counter value
            try engine.assertFact([.symbol("counter"), .symbol("count"), .int(counter)])
            engine.step()
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handleAction(_ action: String) {
        let oldValue = counter
        switch action {
        case "increment": counter += 1
        case "decrement": counter -= 1
        default: return
        }

        do {
            try engine.retractFact([.symbol("counter"), .symbol("count"), .int(oldValue)])
            try engine.assertFact([.symbol("counter"), .symbol("count"), .int(counter)])
            engine.step()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
