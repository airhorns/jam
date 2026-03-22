RUST_ROOT = ../..

XCODE_DEV = /Applications/Xcode.app/Contents/Developer
SWIFT = $(XCODE_DEV)/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift
XCODE_SDK = $(XCODE_DEV)/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk

SWIFT_ENV = env -i \
	HOME=$(HOME) \
	PATH="$(XCODE_DEV)/Toolchains/XcodeDefault.xctoolchain/usr/bin:$(XCODE_DEV)/usr/bin:/usr/bin:/bin:/usr/sbin" \
	DEVELOPER_DIR=$(XCODE_DEV) \
	SDKROOT=$(XCODE_SDK)

.PHONY: build run clean build-rust build-swift

build: build-rust build-swift

build-rust:
	cd $(RUST_ROOT) && cargo build --release

build-swift: build-rust
	$(SWIFT_ENV) $(SWIFT) build

run: build
	$(SWIFT_ENV) .build/debug/PuddyApp

clean:
	cd $(RUST_ROOT) && cargo clean
	$(SWIFT_ENV) $(SWIFT) package clean
