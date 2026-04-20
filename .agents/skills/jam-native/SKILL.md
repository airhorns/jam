---
name: jam-native
description: Work on Jam's Swift/native runtime and native examples. Use when touching packages/native, examples/counter-ios, examples/spatial-counter, examples/ui-catalog-native, SwiftUI bridge behavior, or native build/test validation.
allowed-tools: Bash(swift:*), Bash(xcrun:*), Bash(pnpm:*), Bash(just:*)
---

# Jam Native / Swift

Use existing native package entry points. Do not add alternate native command
layers unless the package layout itself changes.

## Host Probe

Start by checking whether the host can run native validation:

```bash
swift --version
xcrun simctl list devices
```

If Swift or Xcode is missing, record that limitation in the workpad or PR notes.
Still run TypeScript/package checks for any changed JS bridge code.

## Common Commands

```bash
just test-swift
just build-native
pnpm --dir packages/native build
pnpm --dir examples/ui-catalog-native build:program
swift test --package-path packages/native
swift build --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
swift build --package-path examples/ui-catalog-native
pnpm --dir packages/ui exec vitest run src/__tests__/native-mode.test.ts
```

Run `pnpm --dir packages/native build` before Swift builds when the
native runtime resource bundle must reflect TypeScript source changes.
Run `pnpm --dir examples/ui-catalog-native build:program` before
building the native catalog so its generated Swift resource reflects the
TypeScript catalog source.

On Linux, a repeatable Swift compiler check can run through Docker:

```bash
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift --version
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift build --package-path packages/native
```

The current Jam native Swift package imports Apple frameworks (`JavaScriptCore`
and `SwiftUI`), so Linux Swift images can prove the compiler/toolchain is
available but cannot compile or render the Apple-platform native targets. When
those imports fail on Linux, record the exact failure, run the
`native-mode.test.ts` contract test and JS bundle builds locally, then rely on
macOS CI for Swift package/native example builds and SwiftUI rendering coverage.

## What To Inspect

- `packages/native/Sources/JamNative/JamRuntime.swift` for JavaScriptCore bridge behavior.
- `packages/native/Sources/JamNative/JamView.swift` and related files for SwiftUI rendering.
- `packages/native/src/` for bundled runtime shims.
- `examples/counter-ios` for the minimal native app proof.
- `examples/ui-catalog-native` for `@jam/ui` component catalog coverage through SwiftUI.
