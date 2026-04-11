default:
    @just --list

test:
    cd packages/core && pnpm test
    cd examples/folk-todo && pnpm test

test-e2e:
    cd examples/folk-todo && pnpm test:e2e

typecheck:
    pnpm -r typecheck

dev:
    cd examples/folk-todo && pnpm dev
