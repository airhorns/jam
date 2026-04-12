import SwiftUI
import AppKit
import JamNative

@main
struct PuddyApp: App {
    @State private var runtime = JamRuntime()
    @State private var sessionManager: SessionManager?

    var body: some Scene {
        WindowGroup {
            JamView(runtime: runtime)
                .frame(minWidth: 800, minHeight: 500)
                .background(Color(red: 13/255, green: 17/255, blue: 23/255))
                .onAppear {
                    // Make the app a proper foreground application (needed when launched from CLI)
                    NSApp?.setActivationPolicy(.regular)
                    setup()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        NSApp?.activate()
                        for window in NSApp?.windows ?? [] where window.isVisible {
                            window.orderFrontRegardless()
                        }
                    }
                }
        }
    }

    private func setup() {
        // 1. Set up the design system and initial state
        runtime.loadProgram(id: "setup", source: PuddyPrograms.designSystem)
        runtime.loadProgram(id: "initial-state", source: PuddyPrograms.initialState)

        // 2. Mount the UI component tree
        runtime.mountProgram(id: "app", source: PuddyPrograms.appComponent)

        // 3. Create the session manager (Swift-side networking)
        let mgr = SessionManager(runtime: runtime)
        self.sessionManager = mgr
        mgr.checkConnection()
    }
}
