import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

// Local Workbench trial package: arm64 only (skips missing x64 native variants).
const identity = getLocalBuildIdentity()
console.log(`[build:workbench] local update version ${identity.version}`)
const electronBuilder = resolve('node_modules/.bin/electron-builder')
execFileSync(
  electronBuilder,
  ['--config', 'config/electron-builder.config.cjs', '--mac', '--arm64'],
  {
    env: {
      ...process.env,
      ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
      ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev',
      WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
      VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
      ORCA_BUILD_COMMIT: identity.commit,
      ORCA_LOCAL_BUILD_VERSION: identity.version
    },
    stdio: 'inherit',
    cwd: resolve('.')
  }
)
