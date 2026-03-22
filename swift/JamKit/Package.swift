// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JamKit",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "JamKit", targets: ["JamKit"]),
    ],
    targets: [
        .target(
            name: "CJamBridge",
            path: "Sources/CJamBridge",
            publicHeadersPath: "include"
        ),
        .target(
            name: "JamKit",
            dependencies: ["CJamBridge"],
            path: "Sources/JamKit",
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
