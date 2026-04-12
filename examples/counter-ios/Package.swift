// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CounterApp",
    platforms: [.iOS(.v17), .macOS(.v14)],
    dependencies: [
        .package(path: "../../packages/native"),
    ],
    targets: [
        .executableTarget(
            name: "CounterApp",
            dependencies: [
                .product(name: "JamNative", package: "native"),
            ],
            path: "CounterApp"
        ),
    ]
)
