# Native Development From Linux

This note captures the recommended workflow for working on Jam Native from a
remote Linux development host.

## Current Host Signal

The HAR-99 Linux host was probed on 2026-04-20:

```bash
$ swift --version
/bin/bash: line 1: swift: command not found

$ xcrun simctl list devices
/bin/bash: line 1: xcrun: command not found

$ docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift --version
Swift version 5.9.2 (swift-5.9.2-RELEASE)
Target: x86_64-unknown-linux-gnu

$ docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift build --package-path packages/native
error: no such module 'JavaScriptCore'
```

The Docker result is expected. `packages/native/Sources/JamNative/JamRuntime.swift`
imports `JavaScriptCore`, `JamView.swift` imports `SwiftUI`, and
`packages/native/Package.swift` declares Apple platforms. Linux Swift can prove
that a Swift compiler is available, but it cannot compile Jam's current native
Apple-platform runtime or render SwiftUI.

## Bottom Line

Do not try to make the Linux cloud box run Xcode, Apple SDKs, iOS simulators, or
macOS VMs directly. Keep Linux agents focused on the JavaScript side of native
mode and use a real macOS environment for SwiftUI, JavaScriptCore, simulator,
and Apple SDK validation.

Why:

- Apple's Xcode and Apple SDKs agreement says the Apple software is authorized
  only for execution on an Apple-branded product running macOS:
  <https://www.apple.com/legal/sla/docs/xcode.pdf>
- Apple's Xcode system requirements are macOS-specific, and visionOS
  development requires Apple silicon:
  <https://developer.apple.com/xcode/system-requirements/>
- Apple's Virtualization framework runs VMs on Apple silicon and Intel-based Mac
  computers, not Linux hosts:
  <https://developer.apple.com/documentation/virtualization>
- Swift itself is available on Linux, including official Docker images:
  <https://www.swift.org/install/linux/docker/>

## What Linux Can Validate

Run these locally from a Linux agent when native-facing TypeScript, `@jam/ui`
native mode, generated catalog programs, or native runtime bundles change:

```bash
corepack pnpm --dir packages/native build
corepack pnpm --dir examples/ui-catalog-native build:program
corepack pnpm --dir packages/ui exec vitest run src/__tests__/native-mode.test.ts
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift --version
```

Optionally run the known-failing Linux Swift package build to prove the failure
is still the Apple module boundary:

```bash
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift build --package-path packages/native
```

Treat `no such module 'JavaScriptCore'` or `no such module 'SwiftUI'` as the
expected boundary unless the package has been intentionally split into a
platform-neutral Swift target.

## What Requires macOS

Run these on macOS CI, a self-hosted Mac, or another real Apple-hosted macOS
environment:

```bash
swift test --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
swift build --package-path examples/ui-catalog-native
xcrun simctl list devices
```

Those commands exercise the Swift package, SwiftUI rendering, JavaScriptCore
bridge behavior, native app targets, and simulator availability. They cannot be
made equivalent on the current Linux host without changing Jam Native's platform
surface.

## Recommended Workflow

For normal agentic development:

1. Develop and review source changes on Linux.
2. Run the Linux-validatable commands above before pushing.
3. Let GitHub Actions run the existing `native-swift` job on `macos-15`.
4. For SwiftUI rendering or simulator-specific debugging, use an interactive
   Mac only for the failing case, not for every edit.

For CI:

- Keep the existing GitHub Actions macOS job as the main gate. GitHub-hosted
  runners are fresh VMs with macOS images and preinstalled tools:
  <https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners/about-github-hosted-runners>
- Pin macOS runner labels intentionally instead of relying only on
  `macos-latest`, because GitHub changes image and Xcode support over time:
  <https://github.com/actions/runner-images>
- Current GitHub runner pricing lists standard macOS runners at a higher
  per-minute rate than Linux, but still cheap enough for PR-gated native builds
  in this repo's scale:
  <https://docs.github.com/en/billing/reference/actions-minute-multipliers>
- `macos-26` is available when the repo needs newer Xcode/macOS coverage:
  <https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners>

For deeper or interactive native work:

- Lowest-friction low-cost option: keep or borrow a Mac mini, enroll it as a
  self-hosted GitHub Actions runner, and make it reachable over SSH/Tailscale
  for simulator debugging and screen sharing.
- Lowest setup option if Jam has an Apple Developer Program membership: Xcode
  Cloud includes 25 compute hours per month with membership and is good for app
  build/test workflows:
  <https://developer.apple.com/xcode-cloud/>
  <https://developer.apple.com/programs/whats-included/>
- Short bursts on AWS EC2 Mac are usually not low-cost because EC2 Mac dedicated
  hosts have a 24-hour minimum allocation period:
  <https://aws.amazon.com/ec2/instance-types/mac/>
- Dedicated Mac hosting such as MacStadium is better for sustained macOS
  capacity than occasional Jam PR validation:
  <https://macstadium.com/pricing>

## Decision For Jam

Keep Jam's native development split in two:

- Linux is the fast edit/test host for TypeScript, VDOM fact emission, native
  display names, generated native catalog programs, and the bundled JavaScript
  runtime.
- macOS CI is the required correctness gate for Swift package tests and native
  examples.
- A self-hosted Mac mini is the best next investment only if the team needs
  interactive simulator debugging more often than GitHub-hosted macOS CI can
  answer.

Avoid Linux macOS virtualization, Hackintosh-style setups, and QEMU macOS images
for this repo. They are brittle, slow, and do not satisfy Apple's Apple-branded
macOS/Xcode execution requirement.
