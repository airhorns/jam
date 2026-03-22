// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CounterApp",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "CounterApp",
            path: "Sources/CounterApp",
            swiftSettings: [
                .unsafeFlags(["-import-objc-header", "Sources/CounterApp/Generated/bridging-header.h"]),
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
