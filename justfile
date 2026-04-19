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

agent-dev:
    node scripts/agent-harness.mjs start folk-todo

agent-status:
    node scripts/agent-harness.mjs status

agent-logs run='':
    node scripts/agent-harness.mjs logs {{run}}

agent-stop run='all':
    node scripts/agent-harness.mjs stop {{run}}

agent-browser:
    node scripts/agent-harness.mjs browser-smoke folk-todo

agent-native:
    node scripts/agent-harness.mjs native doctor

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
