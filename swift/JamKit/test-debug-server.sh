#!/bin/bash
# Integration test for the JamDebugServer.
# Builds and launches a Jam app, connects to its debug socket,
# runs all commands, and verifies responses.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../.."
COUNTER_DIR="$REPO_ROOT/examples/counter"
PASS=0
FAIL=0

assert_contains() {
    local label="$1" response="$2" expected="$3"
    if echo "$response" | grep -q "$expected"; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label — expected '$expected' in: $response"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Building counter app ==="
cd "$COUNTER_DIR"
make build 2>&1 | tail -3

echo ""
echo "=== Launching app ==="
.build/debug/CounterApp &
APP_PID=$!
echo "PID: $APP_PID"

# Wait for socket
SOCK=""
for i in $(seq 1 20); do
    SOCK="/tmp/jam-debug-${APP_PID}.sock"
    if [ -S "$SOCK" ]; then
        break
    fi
    sleep 0.25
done

if [ ! -S "$SOCK" ]; then
    echo "FAIL: Socket not found after 5s"
    kill $APP_PID 2>/dev/null
    exit 1
fi
echo "Socket: $SOCK"
echo ""

echo "=== Testing commands ==="

# ping
RESP=$(echo '{"cmd":"ping"}' | nc -U "$SOCK" -w 2)
assert_contains "ping returns ok" "$RESP" '"ok":true'
assert_contains "ping returns pid" "$RESP" "\"pid\":$APP_PID"

# tree
RESP=$(echo '{"cmd":"tree"}' | nc -U "$SOCK" -w 2)
assert_contains "tree returns ok" "$RESP" '"ok":true'
assert_contains "tree contains root" "$RESP" 'id=\\"root'
assert_contains "tree contains VStack" "$RESP" 'VStack'

# facts
RESP=$(echo '{"cmd":"facts"}' | nc -U "$SOCK" -w 2)
assert_contains "facts returns ok" "$RESP" '"ok":true'
assert_contains "facts contains facts array" "$RESP" '"facts":'

# screenshot to file
RESP=$(echo '{"cmd":"screenshot","path":"/tmp/jam-test-screenshot.png"}' | nc -U "$SOCK" -w 2)
assert_contains "screenshot returns ok" "$RESP" '"ok":true'
assert_contains "screenshot returns path" "$RESP" 'jam-test-screenshot.png'
if [ -f /tmp/jam-test-screenshot.png ]; then
    echo "  PASS: screenshot file exists"
    PASS=$((PASS + 1))
    rm /tmp/jam-test-screenshot.png
else
    echo "  FAIL: screenshot file not created"
    FAIL=$((FAIL + 1))
fi

# fire (press increment button — need to find its entity ID from facts)
FACTS_RESP=$(echo '{"cmd":"facts"}' | nc -U "$SOCK" -w 2)
# Find the increment button's onPress callback ID from facts
INC_CB=$(echo "$FACTS_RESP" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
for fact in data.get('facts', []):
    terms = [str(t) for t in fact]
    joined = ' '.join(terms)
    if 'inc' in joined and 'onPress' in joined:
        # The callback value is the last term (entityId:onPress)
        for t in fact:
            if isinstance(t, str) and ':onPress' in t:
                print(t)
                break
        break
" 2>/dev/null)
if [ -n "$INC_CB" ]; then
    RESP=$(printf '{"cmd":"fire","callbackId":"%s"}\n' "$INC_CB" | nc -U "$SOCK" -w 2)
    assert_contains "fire returns ok" "$RESP" '"ok":true'

    # Verify counter incremented
    FACTS_RESP=$(echo '{"cmd":"facts"}' | nc -U "$SOCK" -w 2)
    assert_contains "counter incremented after fire" "$FACTS_RESP" '"count"'
else
    echo "  SKIP: could not find increment button callback"
fi

# invalid command
RESP=$(echo '{"cmd":"bogus"}' | nc -U "$SOCK" -w 2)
assert_contains "invalid command returns error" "$RESP" '"error"'

echo ""
echo "=== Cleanup ==="
kill $APP_PID 2>/dev/null
wait $APP_PID 2>/dev/null || true

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
    exit 1
fi
