import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

// 发布出包必须注入产品版本号：--version <v> 或 WORKBENCH_RELEASE_VERSION=<v>。
// 走 ORCA_WIN_ADHOC + ORCA_ADHOC_BUILD_VERSION 是 electron-builder.config.cjs 里
// 现成的「未签名 Windows 构建」通道：它省略 publisherName（否则装机后 app-update.yml
// 声明 SignPath，应用内更新器会按 Authenticode 拒收我们的未签名安装包），并把版本
// 原样打进包内与 latest.yml。注入值必须是产品版本（如 0.7.0 / 0.7.0-rc.20261101.1），
// 绝不能用 -local 构建号——更新链靠版本号比大小，装进 1.4.197-local.* 的用户会永远
// 被判「已是最新」（v0.6.0 的教训，见 issue #338）。
function resolveInjectedVersion(argv) {
  const flagIndex = argv.indexOf('--version')
  const fromFlag = flagIndex === -1 ? undefined : argv[flagIndex + 1]
  if (fromFlag && !fromFlag.startsWith('--')) {
    return fromFlag.trim()
  }
  const fromEnv = process.env.WORKBENCH_RELEASE_VERSION
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null
}

const releaseVersion = resolveInjectedVersion(process.argv.slice(2))

const environment = {
  ...process.env,
  WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
  VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
  ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
  ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev',
  ...(releaseVersion ? { ORCA_WIN_ADHOC: '1', ORCA_ADHOC_BUILD_VERSION: releaseVersion } : {})
}
if (releaseVersion) {
  console.log(`注入产品版本 ${releaseVersion}（未签名构建通道，省略 publisherName）`)
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
  [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--win',
    '--publish',
    'never'
  ]
]) {
  execFileSync(command, [...prefixArgs, ...args], {
    cwd: resolve('.'),
    env: environment,
    stdio: 'inherit',
    shell
  })
}
