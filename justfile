default:
    @just --list

test:
    corepack pnpm -r --if-present test

test-swift:
    swift test --package-path packages/native

test-e2e:
    corepack pnpm --dir examples/folk-todo test:e2e

typecheck:
    corepack pnpm -r typecheck

dev:
    corepack pnpm --dir examples/folk-todo dev

swift-build target:
    swift build --package-path {{target}}

swift-run target:
    swift run --package-path {{target}}

build-native:
    corepack pnpm --dir packages/native build
    swift build --package-path packages/native

build-puddy-native:
    corepack pnpm --dir packages/native build
    swift build --package-path examples/puddy-native
