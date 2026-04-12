// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PuddyApp",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "../../packages/native"),
    ],
    targets: [
        .executableTarget(
            name: "PuddyApp",
            dependencies: [
                .product(name: "JamNative", package: "native"),
            ],
            path: "PuddyApp"
        ),
    ]
)
