import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const environment = {
  ...process.env,
  WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
  VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
  ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
  ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev'
}
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

for (const args of [
  ['run', 'build:desktop'],
  ['run', 'ensure:electron-runtime'],
  ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--win']
]) {
  execFileSync(pnpm, args, { cwd: resolve('.'), env: environment, stdio: 'inherit' })
}
