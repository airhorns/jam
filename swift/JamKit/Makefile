RUST_ROOT = ../..
BRIDGE_OUT_DIR = $(shell find $(RUST_ROOT)/target/release/build/jam-*/out -maxdepth 0 2>/dev/null | head -1)

.PHONY: update-bridge

# Copy generated bridge files from the Rust build into JamKit.
# Run this after `cargo build --release` if the Rust FFI interface changes.
update-bridge:
	@echo "Copying generated bridge files from $(BRIDGE_OUT_DIR)"
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.h Sources/CJamBridge/include/
	cp $(BRIDGE_OUT_DIR)/jam/jam.h Sources/CJamBridge/include/
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.swift Sources/JamKit/
	cp $(BRIDGE_OUT_DIR)/jam/jam.swift Sources/JamKit/
	@# Add import CJamBridge to generated Swift files
	@grep -q 'import CJamBridge' Sources/JamKit/SwiftBridgeCore.swift || \
		sed -i '' '1s/^/import CJamBridge\n/' Sources/JamKit/SwiftBridgeCore.swift
	@grep -q 'import CJamBridge' Sources/JamKit/jam.swift || \
		sed -i '' '1s/^/import CJamBridge\n/' Sources/JamKit/jam.swift
