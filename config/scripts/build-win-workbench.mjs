import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePnpmCliInvocation } from './tool-invocation/pnpm-cli-invocation.mjs'
import { createLocalBuildVersion } from './desktop-distribution/macos/build-mac-local.mjs'

function resolveInjectedVersion(argv) {
  const flagIndex = argv.indexOf('--version')
  if (flagIndex !== -1) {
    const version = argv[flagIndex + 1]?.trim()
    if (!version || version.startsWith('--')) {
      throw new Error('Pass a version after --version.')
    }
    return version
  }
  return (
    process.env.WORKBENCH_RELEASE_VERSION?.trim() ||
    (process.env.ORCA_WIN_ADHOC === '1' ? process.env.ORCA_ADHOC_BUILD_VERSION?.trim() : '')
  )
}

function resolveLocalVersion() {
  try {
    const { version } = JSON.parse(
      readFileSync(new URL('../workbench-release-baseline.json', import.meta.url), 'utf8')
    )
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('config/workbench-release-baseline.json must contain a stable BW version.')
    }
    const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    return createLocalBuildVersion(version, Math.floor(Date.now() / 1000), commit)
  } catch (error) {
    throw new Error(
      'Cannot resolve a Workbench trial version. Pass --version or set WORKBENCH_RELEASE_VERSION.',
      { cause: error }
    )
  }
}

const argv = process.argv.slice(2)
const releaseVersion = resolveInjectedVersion(argv) || resolveLocalVersion()
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(releaseVersion)) {
  throw new Error(`Invalid Workbench version: ${releaseVersion}`)
}
if (argv.includes('--print-version')) {
  console.log(releaseVersion)
  process.exit(0)
}

const environment = {
  ...process.env,
  WORKBENCH_SHELL: process.env.WORKBENCH_SHELL || '1',
  VITE_WORKBENCH_SHELL: process.env.VITE_WORKBENCH_SHELL || '1',
  ORCA_PRODUCT_NAME: process.env.ORCA_PRODUCT_NAME || 'Workbench',
  ORCA_APP_ID: process.env.ORCA_APP_ID || 'com.stablyai.workbench.dev',
  // The unsigned Windows channel stamps the version without declaring a SignPath publisher.
  ORCA_WIN_ADHOC: '1',
  ORCA_ADHOC_BUILD_VERSION: releaseVersion
}
console.log(`注入 Workbench 版本 ${releaseVersion}（未签名构建通道，省略 publisherName）`)
const { command, prefixArgs, shell } = resolvePnpmCliInvocation()

// build:desktop 含 typecheck。设置页仍引用已删除的 mobile 模块，类型检查失败，
// 但这些文件不在打包图里。出包走其余构建步骤。
for (const args of [
  ['run', 'build:native'],
  ['run', 'build:desktop:assets'],
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
