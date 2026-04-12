// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JamNative",
    platforms: [.iOS(.v17), .macOS(.v14), .visionOS(.v1)],
    products: [
        .library(name: "JamNative", targets: ["JamNative"]),
    ],
    targets: [
        .target(
            name: "JamNative",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "JamNativeTests",
            dependencies: ["JamNative"]
        ),
    ]
)
