// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "mars-autoclicker",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "AutoClickerCore",
            targets: ["AutoClickerCore"]
        ),
        .executable(
            name: "AutoClickerApp",
            targets: ["AutoClickerApp"]
        ),
        .executable(
            name: "autoclicker",
            targets: ["autoclicker"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-testing.git", exact: "6.2.4")
    ],
    targets: [
        .target(
            name: "AutoClickerCore",
            path: "Sources/AutoClickerCore"
        ),
        .executableTarget(
            name: "AutoClickerApp",
            dependencies: ["AutoClickerCore"],
            path: "Sources/AutoClickerApp"
        ),
        .executableTarget(
            name: "autoclicker",
            dependencies: ["AutoClickerCore"],
            path: "Sources/autoclicker"
        ),
        .testTarget(
            name: "AutoClickerCoreTests",
            dependencies: [
                "AutoClickerCore",
                .product(name: "Testing", package: "swift-testing")
            ],
            path: "Tests/AutoClickerCoreTests"
        )
    ]
)
