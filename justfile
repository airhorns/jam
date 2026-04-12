default:
    @just --list

test:
    cd packages/core && pnpm test
    cd examples/folk-todo && pnpm test

test-swift:
    swift test --package-path packages/native

test-e2e:
    cd examples/folk-todo && pnpm test:e2e

typecheck:
    pnpm -r typecheck

dev:
    cd examples/folk-todo && pnpm dev

swift-build target:
    swift build --package-path {{target}}

swift-run target:
    swift run --package-path {{target}}

build-native:
    cd packages/native && pnpm build
    swift build --package-path packages/native

build-puddy-native:
    cd packages/native && pnpm build
    swift build --package-path examples/puddy-native
