RUST_ROOT = ../..
BRIDGE_OUT_DIR = $(shell find $(RUST_ROOT)/target/release/build/jam-*/out -maxdepth 0 2>/dev/null | head -1)

XCODE_DEV = /Applications/Xcode.app/Contents/Developer
SWIFT = $(XCODE_DEV)/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift
XCODE_SDK = $(XCODE_DEV)/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk

SWIFT_ENV = env -i \
	HOME=$(HOME) \
	PATH="$(XCODE_DEV)/Toolchains/XcodeDefault.xctoolchain/usr/bin:$(XCODE_DEV)/usr/bin:/usr/bin:/bin:/usr/sbin" \
	DEVELOPER_DIR=$(XCODE_DEV) \
	SDKROOT=$(XCODE_SDK)

.PHONY: build run clean build-rust copy-bridge build-swift

build: build-rust copy-bridge build-swift

build-rust:
	cd $(RUST_ROOT) && cargo build --release

copy-bridge: build-rust
	@echo "Copying generated bridge files from $(BRIDGE_OUT_DIR)"
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.h Sources/TodoApp/Generated/
	cp $(BRIDGE_OUT_DIR)/SwiftBridgeCore.swift Sources/TodoApp/Generated/
	cp $(BRIDGE_OUT_DIR)/jam/jam.h Sources/TodoApp/Generated/
	cp $(BRIDGE_OUT_DIR)/jam/jam.swift Sources/TodoApp/Generated/

build-swift: copy-bridge
	$(SWIFT_ENV) $(SWIFT) build

run: build
	$(SWIFT_ENV) .build/debug/TodoApp

clean:
	cd $(RUST_ROOT) && cargo clean
	$(SWIFT_ENV) $(SWIFT) package clean
	rm -f Sources/TodoApp/Generated/SwiftBridgeCore.h Sources/TodoApp/Generated/SwiftBridgeCore.swift
	rm -f Sources/TodoApp/Generated/jam.h Sources/TodoApp/Generated/jam.swift
