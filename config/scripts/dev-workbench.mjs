import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Workbench dev profile: the same HMR path as `pnpm dev`, with the Workbench
// shell on and its own userData dir (see dev-workbench-env.mjs).
//
// Why a script instead of the `VAR=1 pnpm run ...` prefix the macOS entry used:
// cmd.exe has no such prefix, so that one-liner only ever ran under a POSIX
// shell and `pnpm run dev:workbench` failed outright on Windows. Setting the
// env here keeps one entry working on every platform.
process.env.WORKBENCH_SHELL ||= '1'
process.env.VITE_WORKBENCH_SHELL ||= '1'
process.env.ORCA_PRODUCT_NAME ||= 'Workbench'

// Why the steps are spelled out instead of re-entering `pnpm run`: going back
// through the pnpm shim means a shell, and a shell re-resolves `pnpm` against
// whatever PATH entry comes first — which on Windows can be a path with spaces
// that cmd.exe then splits.
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: resolve('.')
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run([resolve('config/scripts/ensure-native-runtime.mjs'), '--runtime=electron'])
run([resolve('config/scripts/run-electron-vite-dev.mjs')])
