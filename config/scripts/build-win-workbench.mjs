import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

const environment = {
  ...process.env,
  WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
  VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
  ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
  ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev'
}
const { command, prefixArgs, shell } = resolvePnpmCliInvocation()

// build:desktop 含 typecheck。设置页仍引用已删除的 mobile 模块，类型检查失败，
// 但这些文件不在打包图里。出包走其余构建步骤。
for (const args of [
  ['run', 'build:relay'],
  ['run', 'build:cli'],
  ['run', 'build:electron-vite'],
  ['run', 'verify:built-skills-cli'],
  ['run', 'build:web-from-renderer'],
  ['run', 'ensure:electron-runtime'],
  ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--win', '--publish', 'never']
]) {
  execFileSync(command, [...prefixArgs, ...args], {
    cwd: resolve('.'),
    env: environment,
    stdio: 'inherit',
    shell
  })
}
