RUST_ROOT = ../..

.PHONY: build run clean build-rust build-swift

build: build-rust build-swift

build-rust:
	cd $(RUST_ROOT) && cargo build --release

build-swift: build-rust
	swift build

run: build
	.build/debug/CounterApp

clean:
	cd $(RUST_ROOT) && cargo clean
	swift package clean
