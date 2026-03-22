// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PuddyApp",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "PuddyApp",
            path: "Sources/PuddyApp",
            swiftSettings: [
                .unsafeFlags(["-import-objc-header", "Sources/PuddyApp/Generated/bridging-header.h"]),
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-L../../target/release",
                    "-ljam",
                ]),
                .linkedLibrary("c++"),
            ]
        ),
    ]
)
