default:
    @just --list

test:
    cd packages/core && pnpm test
    cd examples/folk-todo && pnpm test

test-swift:
    env -u SDKROOT -u DEVELOPER_DIR swift test --package-path packages/native

test-e2e:
    cd examples/folk-todo && pnpm test:e2e

typecheck:
    pnpm -r typecheck

dev:
    cd examples/folk-todo && pnpm dev

# Build and run Swift targets (unsets nix SDK env vars that conflict with Xcode)
swift-build target:
    env -u SDKROOT -u DEVELOPER_DIR swift build --package-path {{target}}

swift-run target:
    env -u SDKROOT -u DEVELOPER_DIR swift run --package-path {{target}}

build-native:
    cd packages/native && pnpm build
    env -u SDKROOT -u DEVELOPER_DIR swift build --package-path packages/native

build-puddy-native:
    cd packages/native && pnpm build
    env -u SDKROOT -u DEVELOPER_DIR swift build --package-path examples/puddy-native
