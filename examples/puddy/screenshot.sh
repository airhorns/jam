#!/bin/bash
# screenshot.sh — Build, launch PuddyApp, take a screenshot, and close.
# Usage: ./screenshot.sh [output.png]
# Requires: macOS, Xcode, screencapture
set -e

OUTPUT="${1:-/tmp/puddy_screenshot.png}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

# Build
echo "Building..."
make build 2>&1 | tail -3

# Launch
echo "Launching PuddyApp..."
.build/debug/PuddyApp &
APP_PID=$!

# Wait for window to appear
for i in $(seq 1 10); do
    WINDOW_ID=$(swift -e '
import Cocoa
let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly)
if let windowList = CGWindowListCopyWindowInfo(options, CGWindowID(0)) as? [[String: Any]] {
    for window in windowList {
        let ownerName = window[kCGWindowOwnerName as String] as? String ?? ""
        if ownerName.contains("PuddyApp") {
            let windowId = window[kCGWindowNumber as String] as? Int ?? 0
            print(windowId)
            break
        }
    }
}
' 2>/dev/null)
    if [ -n "$WINDOW_ID" ]; then
        break
    fi
    sleep 0.5
done

if [ -z "$WINDOW_ID" ]; then
    echo "ERROR: Could not find PuddyApp window after 5s"
    kill $APP_PID 2>/dev/null
    exit 1
fi

# Small delay to let rendering settle
sleep 1

# Capture
screencapture -l "$WINDOW_ID" "$OUTPUT"
echo "Screenshot saved to $OUTPUT"

# Cleanup
kill $APP_PID 2>/dev/null || true
wait $APP_PID 2>/dev/null || true
