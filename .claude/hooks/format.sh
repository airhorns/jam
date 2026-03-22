#!/bin/bash

# Format changed files using the appropriate formatter per language
# Usage: format.sh <file1> [file2] [file3] ...

if [ $# -eq 0 ]; then
  exit 0
fi

rs_files=()
ts_files=()

for file in "$@"; do
  # Skip claude/AI config paths
  case "$file" in
    .claude/*|*/AGENTS.md|AGENTS.md)
      continue
      ;;
  esac

  case "$file" in
    *.rs)
      rs_files+=("$file")
      ;;
    *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs)
      ts_files+=("$file")
      ;;
  esac
done

# Format Rust files with rustfmt
if [ ${#rs_files[@]} -gt 0 ]; then
  cargo fmt -- "${rs_files[@]}" 2>/dev/null
fi

# Format TypeScript/JS files with oxfmt
if [ ${#ts_files[@]} -gt 0 ]; then
  pnpm --dir ts exec oxfmt "${ts_files[@]}" 2>/dev/null
fi
