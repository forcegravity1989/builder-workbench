import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

// Local Monica trial package: arm64 only (skips missing x64 native variants).
const identity = getLocalBuildIdentity()
console.log(`[build:monica] local update version ${identity.version}`)
const electronBuilder = resolve('node_modules/.bin/electron-builder')
execFileSync(
  electronBuilder,
  ['--config', 'config/electron-builder.config.cjs', '--mac', '--arm64'],
  {
    env: {
      ...process.env,
      ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Monica',
      ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev',
      MONICA_SHELL: process.env.MONICA_SHELL || '1',
      VITE_MONICA_SHELL: process.env.VITE_MONICA_SHELL || '1',
      ORCA_BUILD_COMMIT: identity.commit,
      ORCA_LOCAL_BUILD_VERSION: identity.version
    },
    stdio: 'inherit',
    cwd: resolve('.')
  }
)
