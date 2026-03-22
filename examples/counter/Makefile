RUST_ROOT = ../..
# swift-bridge generates files into the OUT_DIR during cargo build
BRIDGE_OUT_DIR = $(shell find $(RUST_ROOT)/target/release/build/jam-*/out -maxdepth 0 2>/dev/null | head -1)

.PHONY: build run clean build-rust copy-bridge build-swift

build: build-rust copy-bridge build-swift

build-rust:
	cd $(RUST_ROOT) && cargo build --release

copy-bridge: build-rust
	@echo "Copying generated bridge files from $(BRIDGE_OUT_DIR)"
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.h Sources/CounterApp/Generated/
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.swift Sources/CounterApp/Generated/
	cp $(BRIDGE_OUT_DIR)/jam/jam.h Sources/CounterApp/Generated/
	cp $(BRIDGE_OUT_DIR)/jam/jam.swift Sources/CounterApp/Generated/

build-swift: copy-bridge
	swift build

run: build
	.build/debug/CounterApp

clean:
	cd $(RUST_ROOT) && cargo clean
	swift package clean
	rm -f Sources/CounterApp/Generated/SwiftBridgeCore.h Sources/CounterApp/Generated/SwiftBridgeCore.swift
	rm -f Sources/CounterApp/Generated/jam.h Sources/CounterApp/Generated/jam.swift
