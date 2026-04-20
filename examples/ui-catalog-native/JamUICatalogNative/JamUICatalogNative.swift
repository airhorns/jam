import Foundation
import SwiftUI
import JamNative

@main
struct JamUICatalogNativeApp: App {
    @State private var runtime = JamRuntime()

    var body: some Scene {
        WindowGroup {
            JamView(runtime: runtime)
                .frame(minWidth: 760, minHeight: 640)
                .onAppear { setupCatalog() }
        }
    }

    private func setupCatalog() {
        let program = loadCatalogProgram()
        runtime.loadProgram(id: "catalog-setup", source: program.setup)
        runtime.mountProgram(id: "catalog", source: program.mount)
    }

    private func loadCatalogProgram() -> CatalogProgram {
        guard let url = Bundle.module.url(forResource: "catalog-program", withExtension: "json") else {
            fatalError("Missing catalog-program.json resource. Run `corepack pnpm --dir examples/ui-catalog-native build:program`.")
        }

        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(CatalogProgram.self, from: data)
        } catch {
            fatalError("Failed to load catalog-program.json: \(error)")
        }
    }
}

private struct CatalogProgram: Decodable {
    let setup: String
    let mount: String
}
