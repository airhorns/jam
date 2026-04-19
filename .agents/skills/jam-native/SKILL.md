---
name: jam-native
description: Work on Jam's Swift/native runtime and native examples. Use when touching packages/native, examples/counter-ios, examples/puddy-native, SwiftUI bridge behavior, or native build/test validation.
allowed-tools: Bash(swift:*), Bash(xcrun:*), Bash(corepack pnpm:*), Bash(just:*)
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
just build-puddy-native
swift test --package-path packages/native
swift build --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/puddy-native
corepack pnpm --dir packages/native build
```

Run `corepack pnpm --dir packages/native build` before Swift builds when the
native runtime resource bundle must reflect TypeScript source changes.

## What To Inspect

- `packages/native/Sources/JamNative/JamRuntime.swift` for JavaScriptCore bridge behavior.
- `packages/native/Sources/JamNative/JamView.swift` and related files for SwiftUI rendering.
- `packages/native/src/` for bundled runtime shims.
- `examples/counter-ios` for the minimal native app proof.
- `examples/puddy-native` for the fuller native app proof.
