default:
    @just --list

fmt:
    cargo clippy --fix --allow-dirty && rustfmt --edition=2024 **/*.rs

check:
    cargo clippy -- -D warnings

test:
    cargo test

watch *ARGS:
	bacon --job run -- -- {{ ARGS }}

# Install cargo-llvm-cov if not already installed
_ensure-llvm-cov:
    @command -v cargo-llvm-cov >/dev/null 2>&1 || cargo install cargo-llvm-cov

# Run tests and generate HTML coverage report
coverage: _ensure-llvm-cov
    cargo llvm-cov --html --output-dir target/coverage

# Generate and open HTML coverage report in browser
coverage-open: _ensure-llvm-cov
    cargo llvm-cov --html --output-dir target/coverage --open

# Print coverage summary to terminal
coverage-summary: _ensure-llvm-cov
    cargo llvm-cov

# Generate lcov format for CI/IDE integration
coverage-lcov: _ensure-llvm-cov
    cargo llvm-cov --lcov --output-path target/coverage/lcov.info
