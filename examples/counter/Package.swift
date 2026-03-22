// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CounterApp",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "../../swift/JamKit"),
    ],
    targets: [
        .executableTarget(
            name: "CounterApp",
            dependencies: [
                .product(name: "JamKit", package: "JamKit"),
            ],
            path: "Sources/CounterApp"
        ),
    ]
)
