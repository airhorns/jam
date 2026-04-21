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

## Concrete Progress Options

The path forward is not "develop native blind on Linux." Use Linux for fast
source edits, then choose one of these macOS execution paths depending on what
kind of Swift/native confidence is needed.

### Option 1: Treat GitHub-hosted macOS CI as the default Mac

Use this for every normal PR. It is the lowest-ops option because Jam already has
a `Native Swift` GitHub Actions job that runs on macOS and proves the Swift
package and native examples build with real Apple SDKs.

Make this option stronger by keeping the native job required and adding focused
Swift tests whenever Swift behavior changes:

```bash
swift test --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
swift build --package-path examples/ui-catalog-native
```

How Linux agents use it:

1. Edit on Linux.
2. Run the Linux-validatable checks from this document.
3. Push the PR branch.
4. Use `gh run watch` / `gh run view --log-failed` from Linux to inspect the
   macOS result and patch based on the failing Swift compiler/test output.

This is enough for non-interactive Swift quality: compile errors, Swift unit
tests, generated bundle regressions, native example build breakage, and most
JavaScriptCore bridge failures that can be covered by tests.

Cost profile:

- Public repositories can use standard GitHub-hosted runners without Actions
  minute charges.
- Private repositories pay for macOS runner minutes after included quota; the
  current GitHub pricing page lists standard macOS runners at a per-minute rate:
  <https://docs.github.com/en/billing/reference/actions-minute-multipliers>

### Option 2: Add a manual native smoke workflow

Use this when a change is native-adjacent but does not need a full PR cycle yet.
Add or keep a `workflow_dispatch` macOS workflow that runs the same native
commands on demand and uploads logs/artifacts. A Linux agent can trigger it with
`gh workflow run`, wait with `gh run watch`, and inspect the result with
`gh run view --log-failed`.

This gives fast remote feedback without giving the Linux host Xcode. It is also
the best place to add one-off matrices when Jam needs to compare Xcode or macOS
runner labels.

### Option 3: Put one Mac mini on the network for interactive failures

Use this when the team needs simulator inspection, SwiftUI previews, screen
recordings, or iterative debugging that cannot be understood from CI logs.

Concrete setup:

1. Put a Mac mini on Tailscale or another private network.
2. Install Xcode, Homebrew, mise, Node, pnpm, and the GitHub CLI.
3. Enable SSH and Screen Sharing.
4. Register the Mac as a self-hosted GitHub Actions runner with labels such as
   `self-hosted`, `macos`, `xcode`, and `jam-native`.
5. Keep the same repo commands as the contract: `just test-swift`,
   `just build-native`, and the native example `swift build` commands.

Linux agents still do most work locally, then SSH to the Mac only to run the
native command, inspect the simulator, or capture reviewer media. This is the
lowest-latency option once simulator debugging happens more than occasionally.

Cost profile: usually the lowest sustained cost if the team already owns or can
buy/borrow one Apple silicon Mac. It has a one-time hardware cost plus power and
maintenance, instead of per-hour cloud rental.

### Option 4: Use Xcode Cloud if the team already has Apple membership

Use this when Jam needs Apple-managed build/test infrastructure or TestFlight
packaging but does not need interactive shell access. Apple Developer Program
membership includes Xcode Cloud compute hours:
<https://developer.apple.com/programs/whats-included/>

Xcode Cloud is not a replacement for an SSH-able Mac because agents cannot use
it as a terminal. It is useful as another CI gate for archive/test workflows,
especially if the project grows toward signed app distribution or TestFlight.

### Option 5: Rent Mac capacity only for bursts

Use this for short periods when the team needs a real Mac but does not want to
own one yet.

- AWS EC2 Mac works for dedicated-host automation, but EC2 Mac Dedicated Hosts
  have a 24-hour minimum allocation period, so it is not a cheap per-test
  option: <https://aws.amazon.com/ec2/instance-types/mac/faqs/>
- MacStadium and similar Mac hosting providers are better for sustained or
  team-shared Mac capacity than occasional PR validation:
  <https://macstadium.com/pricing>

Prefer this only when Option 3 is unavailable and the debugging need is too
interactive for GitHub-hosted macOS CI.

### Option 6: Split a Linux-buildable Swift core

Use this if Jam wants more Swift correctness directly on Linux. This is the only
option that changes the code architecture.

The split would be:

- `JamNativeCore`: pure Swift target with no `SwiftUI` or `JavaScriptCore`.
  It owns VDOM fact decoding, style normalization, event/action data models, and
  renderer planning decisions that can be unit-tested on Linux Swift.
- `JamNativeApple`: Apple-only target that imports `SwiftUI` and
  `JavaScriptCore`, hosts the JS runtime, and applies the planned rendering to
  SwiftUI.

That would let Linux agents run meaningful Swift tests with the official Swift
Docker image while macOS CI remains responsible for the Apple UI/runtime layer.
Do this only when the native renderer logic is large enough that CI-only Mac
feedback is slowing feature work; it is more engineering work than just adding
Mac execution capacity.

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

Use this sequence:

1. Keep GitHub-hosted macOS CI as the default correctness gate and make native
   PR failures actionable from Linux with `gh run watch` and failed logs.
2. Add a manual macOS native smoke workflow if native work needs on-demand
   checks before PR review.
3. Buy, borrow, or repurpose one Apple silicon Mac mini as the interactive
   debug box when SwiftUI/simulator issues start blocking more than one-off
   changes.
4. Consider a pure Swift `JamNativeCore` split only if the Swift renderer grows
   enough that agents need Linux-run Swift unit tests for most native logic.
5. Use Xcode Cloud or rented Mac capacity for distribution or burst capacity,
   not as the first-line development loop.

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
