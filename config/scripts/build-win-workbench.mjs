import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

// Local Workbench trial package for Windows: x64 only, unsigned.
//
// Why the whole chain lives here instead of in a package.json one-liner:
// build:mac:workbench can prefix `VAR=1 pnpm run ...` because it only ever runs
// under a POSIX shell. cmd.exe has no such prefix, and the Workbench identity
// has to be in the environment of *both* the renderer build (electron.vite
// inlines VITE_WORKBENCH_SHELL) and electron-builder, so this script owns the
// env and spawns both steps itself.
//
// Why x64 only: the local trial targets the machine it is built on, and the
// Windows runtime natives (windows-process-tree, windows-registry, PTY) are
// installed for the host arch by ensure-native-runtime.
const identity = getLocalBuildIdentity()
console.log(`[build:win:workbench] local update version ${identity.version}`)

const isWindows = process.platform === 'win32'

const env = {
  ...process.env,
  ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
  ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev',
  WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
  VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
  ORCA_BUILD_COMMIT: identity.commit,
  ORCA_LOCAL_BUILD_VERSION: identity.version
}

// Why a shell instead of execFileSync: pnpm and electron-builder are .cmd shims
// on Windows, and Node refuses to spawn those without one (CVE-2024-27980).
// Going through a shell means quoting is ours to get right.
const quote = (value) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)
const run = (command, args) =>
  execSync([command, ...args].map(quote).join(' '), { env, stdio: 'inherit', cwd: resolve('.') })

run('pnpm', ['run', 'build:desktop'])
run('pnpm', ['run', 'ensure:electron-runtime'])
run(resolve(`node_modules/.bin/electron-builder${isWindows ? '.cmd' : ''}`), [
  '--config',
  'config/electron-builder.config.cjs',
  '--win',
  '--x64'
])
