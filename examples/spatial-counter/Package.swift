// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpatialCounterApp",
    platforms: [.visionOS(.v1), .macOS(.v14)],
    dependencies: [
        .package(path: "../../packages/native"),
    ],
    targets: [
        .executableTarget(
            name: "SpatialCounterApp",
            dependencies: [
                .product(name: "JamNative", package: "native"),
            ],
            path: "SpatialCounterApp"
        ),
    ]
)
