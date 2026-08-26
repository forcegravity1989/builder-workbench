#!/usr/bin/env bash
# Non-negotiable #1 (plan 00 §3): the domain kernel must never depend on a UI
# crate. This guard fails CI if any kernel crate pulls dioxus / tauri / wry /
# leptos into its *normal* dependency tree — the wall that keeps desktop & web
# reuse cheap and the wasm32 keepalive honest.
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo}"
KERNEL=(bw bw-engine)
# dioxus 全家桶都挡:顶层 `dioxus` 与子 crate(`dioxus-core` / `dioxus-hooks` /
# `dioxus-desktop` …)都算 UI 渗透。`[ -]` 后缀同时吃 `dioxus v0.7`(空格)与
# `dioxus-core v0.7`(连字符)。
FORBIDDEN='dioxus|tauri|wry|leptos'

fail=0
for c in "${KERNEL[@]}"; do
  # Forward dependency tree of the kernel crate, normal edges only.
  if "$CARGO" tree -p "$c" --edges normal --prefix none 2>/dev/null \
      | grep -Eiq "^($FORBIDDEN)[ -]"; then
    echo "✗ kernel crate '$c' pulls a UI dependency:"
    "$CARGO" tree -p "$c" --edges normal --prefix none \
      | grep -Ei "^($FORBIDDEN)[ -]" | sort -u | sed 's/^/    /'
    fail=1
  else
    echo "✓ $c is UI-free"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "Kernel crates must stay UI-agnostic (command in, event out). Move the"
  echo "offending dependency into app-shell."
  exit 1
fi
echo "All kernel crates are UI-free."
