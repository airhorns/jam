// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JamUICatalogNative",
    platforms: [.iOS(.v17), .macOS(.v14)],
    dependencies: [
        .package(path: "../../packages/native"),
    ],
    targets: [
        .executableTarget(
            name: "JamUICatalogNative",
            dependencies: [
                .product(name: "JamNative", package: "native"),
            ],
            path: "JamUICatalogNative",
            resources: [.process("Resources")]
        ),
    ]
)
