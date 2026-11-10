#!/usr/bin/env bash
set -euo pipefail

# The hosted job owns this disposable keyring. It contains synthetic browser fixtures only.
test -n "${RUNNER_TEMP:-}"
keyring_data=$(mktemp -d "${RUNNER_TEMP}/bw-smoke-keyring.XXXXXX")
mkdir -p "$keyring_data/control"
printf '%s' 'BW-fixture-only-keyring-582' | XDG_DATA_HOME="$keyring_data" gnome-keyring-daemon --daemonize --unlock --components=secrets --control-directory="$keyring_data/control"
pnpm run test:e2e:workbench
