import SwiftUI
import AppKit

@main
struct CounterApp: App {
    init() {
        // SPM executables aren't app bundles, so macOS doesn't activate them.
        // Force the process to be a regular GUI app with a Dock icon and menu bar.
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
