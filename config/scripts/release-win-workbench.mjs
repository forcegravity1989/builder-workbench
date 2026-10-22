#!/usr/bin/env node

// Workbench Windows 发布：出包 → tag → 上传三资产 → 建 GitHub Release → 读回。
// 本脚本是 Builder Workbench 专用（只 3 个 Windows 资产），不复用 Orca 的多平台发布器。
// 版本描述（Release body）一律由 --notes-file 传入，按 references/release-notes-spec.md 撰写；
// 脚本绝不自动拼 body（不用 gh 的 --generate-notes），以免退回已合 PR 的扁平罗列。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { truncateReleaseBody } from './create-draft-release.mjs'

// electron-builder.config.cjs 的 win artifactName 为 'orca-windows-setup.${ext}'；latest.yml 是更新清单。
export const WORKBENCH_RELEASE_ASSETS = [
  'orca-windows-setup.exe',
  'orca-windows-setup.exe.blockmap',
  'latest.yml'
]

// Workbench rc 形态是 vX.Y.Z-rc.YYYYMMDD.N（日期.构建号），与 Orca 的 vX.Y.Z-rc.N 不同，
// 故不复用 create-draft-release 的 parseDesktopReleaseTag，改用 Workbench 专用解析。
const WORKBENCH_RELEASE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+)\.(\d+))?$/

export function parseWorkbenchReleaseTag(tag) {
  const match = WORKBENCH_RELEASE_TAG_PATTERN.exec(tag)
  if (!match) {
    return null
  }
  return {
    tag,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rcDate: match[4] ?? null,
    rcBuild: match[5] === undefined ? null : Number(match[5])
  }
}

export function parseReleaseArgs(argv) {
  const args = {
    version: null,
    notesFile: null,
    target: 'HEAD',
    distDir: 'dist',
    build: false,
    publish: false,
    allowDirty: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      i += 1
      return value
    }
    switch (token) {
      case '--version':
        args.version = next()
        break
      case '--notes-file':
        args.notesFile = next()
        break
      case '--target':
        args.target = next()
        break
      case '--dist-dir':
        args.distDir = next()
        break
      case '--build':
        args.build = true
        break
      case '--publish':
        args.publish = true
        break
      case '--allow-dirty':
        args.allowDirty = true
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }
  // --publish 是发布授权闸；不带它则只做只读预演（prepare），不写 tag、不建 Release。
  args.dryRun = !args.publish
  return args
}

export function resolveReleaseVersion({ explicitVersion }) {
  const version = (explicitVersion ?? '').trim()
  if (!version) {
    throw new Error(
      'No version: pass --version <X.Y.Z | X.Y.Z-rc.YYYYMMDD.N>. package.json 保留的是上游 Orca 基线版本，永远不作为 Workbench 发布版本。'
    )
  }
  return version
}

// 更新器账本要求 tag、latest.yml、包内自报版本三处一致（issue #338：v0.6.0 的
// latest.yml 是 -local 构建号，装它的用户会被永远判「已是最新」）。
// latest.yml 由 electron-builder 生成，格式固定，只读 version 字段，不做完整 YAML 解析。
export function readManifestVersion(distDir) {
  const manifestPath = join(distDir, 'latest.yml')
  if (!existsSync(manifestPath)) {
    return null
  }
  const match = /^version:\s*(.+)$/m.exec(readFileSync(manifestPath, 'utf8'))
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null
}

export function deriveReleaseTag(version) {
  const tag = `v${version}`
  if (!parseWorkbenchReleaseTag(tag)) {
    throw new Error(
      `Version "${version}" does not form a valid Workbench release tag (want vX.Y.Z or vX.Y.Z-rc.YYYYMMDD.N)`
    )
  }
  return tag
}

export function isPrereleaseTag(tag) {
  const parsed = parseWorkbenchReleaseTag(tag)
  return Boolean(parsed && parsed.rcDate !== null)
}

export function selectReleaseAssets(distDir) {
  const assets = WORKBENCH_RELEASE_ASSETS.map((name) => {
    const path = join(distDir, name)
    return { name, path, exists: existsSync(path) }
  })
  return { assets, missing: assets.filter((asset) => !asset.exists).map((asset) => asset.name) }
}

export function buildGhReleaseCreateArgs({
  tag,
  assetPaths,
  target,
  title,
  notesFile,
  prerelease
}) {
  return [
    'release',
    'create',
    tag,
    ...assetPaths,
    '--target',
    target,
    '--title',
    title,
    '--notes-file',
    notesFile,
    ...(prerelease ? ['--prerelease'] : [])
  ]
}

// 发布授权闸：正式发布必须带按规范写好的 body 文件，绝不回退到自动拼装。
export function assertPublishAuthorized({ publish, notesFile }) {
  if (!publish) {
    return
  }
  if (!notesFile) {
    throw new Error(
      '--publish requires --notes-file <path> (release body written per references/release-notes-spec.md); refusing to auto-generate notes'
    )
  }
  if (!existsSync(notesFile)) {
    throw new Error(`--notes-file not found: ${notesFile}`)
  }
}

function defaultExec(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options })
}

function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function assetReport(assets) {
  return assets.map((asset) => {
    if (!asset.exists) {
      return { name: asset.name, present: false }
    }
    const stats = statSync(asset.path)
    return {
      name: asset.name,
      present: true,
      bytes: stats.size,
      sha256: asset.name.endsWith('.exe') ? sha256OfFile(asset.path) : undefined
    }
  })
}

function readGitHead(exec) {
  return exec('git', ['rev-parse', 'HEAD']).trim()
}

function headOnRemote(exec, head) {
  const branches = exec('git', ['branch', '-r', '--contains', head], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return branches
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function workingTreeDirty(exec) {
  return exec('git', ['status', '--porcelain']).trim().length > 0
}

function ghAuthenticated(exec) {
  try {
    exec('gh', ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

function releaseExists(exec, tag) {
  try {
    const json = exec('gh', ['release', 'view', tag, '--json', 'tagName,isDraft'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function runWorkbenchRelease({
  argv,
  exec = defaultExec,
  log = console.log,
  cwd = resolve('.')
}) {
  const args = parseReleaseArgs(argv)
  const version = resolveReleaseVersion({ explicitVersion: args.version })
  const tag = deriveReleaseTag(version)
  const title = `Workbench ${version}`
  const distDir = resolve(cwd, args.distDir)
  const notesFile = args.notesFile ? resolve(cwd, args.notesFile) : null

  assertPublishAuthorized({ publish: args.publish, notesFile })

  // 需要出包时复用唯一出包入口，不在此重造构建步骤；产品版本号随包注入，保证账本三处一致。
  if (args.build) {
    log(`Building Workbench installer via build-win-workbench.mjs …`)
    // process.execPath 而非字面 'node'：本机 node 不保证在 PATH（与 build-win-workbench 同口径）。
    exec(process.execPath, ['config/scripts/build-win-workbench.mjs', '--version', version], {
      cwd,
      stdio: 'inherit'
    })
  }

  const { assets, missing } = selectReleaseAssets(distDir)
  const head = readGitHead(exec)
  const remoteBranches = headOnRemote(exec, head)
  const dirty = workingTreeDirty(exec)
  const authed = ghAuthenticated(exec)
  const existing = releaseExists(exec, tag)

  const report = assetReport(assets)
  log(`版本 ${version} · tag ${tag} · 目标 ${head.slice(0, 12)}`)
  for (const item of report) {
    log(
      item.present
        ? `  ✓ ${item.name} (${item.bytes} bytes${item.sha256 ? ` · sha256 ${item.sha256}` : ''})`
        : `  ✗ ${item.name} 缺失`
    )
  }

  // 阻断项：任一成立都不发布，逐条说明，不覆盖既有 Release。
  const blockers = []
  if (missing.length > 0) {
    blockers.push(`缺资产：${missing.join(', ')}（先出包或 --build）`)
  }
  if (!missing.includes('latest.yml')) {
    // 账本门禁：清单版本必须等于发布版本，否则装机用户自报版本与 tag 脱节，
    // 更新链从此判不动新旧（issue #338）。
    const manifestVersion = readManifestVersion(distDir)
    if (manifestVersion !== version) {
      blockers.push(
        `账本不一致：latest.yml 版本为 ${manifestVersion ?? '无法解析'}，应为 ${version}（tag/清单/包内版本三处必须一致；用 --build 重新出包并注入版本）`
      )
    }
  }
  if (remoteBranches.length === 0) {
    blockers.push(`HEAD ${head.slice(0, 12)} 不在任何远端分支上（先 push）`)
  }
  if (dirty && !args.allowDirty) {
    blockers.push('工作区有未提交改动，产物无法归属该 HEAD（清理或 --allow-dirty 明示）')
  }
  if (!authed) {
    blockers.push('gh 未登录（gh auth login）')
  }
  if (existing) {
    blockers.push(
      existing.isDraft === true
        ? `Release ${tag} 已存在草稿，本脚本不覆盖草稿（改用 gh release edit 处理）`
        : `Release ${tag} 已发布，不覆盖`
    )
  }

  const ghArgs = buildGhReleaseCreateArgs({
    tag,
    assetPaths: assets.map((asset) => asset.path),
    target: args.target === 'HEAD' ? head : args.target,
    title,
    notesFile: args.notesFile ?? '<notes-file>',
    prerelease: isPrereleaseTag(tag)
  })

  if (args.dryRun) {
    log('')
    log(
      blockers.length > 0
        ? `预演发现阻断项：\n  - ${blockers.join('\n  - ')}`
        : '预演通过：无阻断项。'
    )
    log('')
    log('正式发布将执行（需 --publish 与 --notes-file）：')
    log(`  gh ${ghArgs.join(' ')}`)
    return { mode: 'prepare', tag, version, blockers, wouldRun: `gh ${ghArgs.join(' ')}` }
  }

  if (blockers.length > 0) {
    throw new Error(`发布中止：\n  - ${blockers.join('\n  - ')}`)
  }

  // body 可能超 GitHub 上限，复用 create-draft-release 的截断，写临时文件交给 gh。
  const body = truncateReleaseBody(readFileSync(notesFile, 'utf8'))
  const tmpDir = mkdtempSync(join(tmpdir(), 'wb-release-'))
  try {
    const notesPath = join(tmpDir, 'RELEASE_NOTES.md')
    writeFileSync(notesPath, body, 'utf8')

    log('')
    log(`创建 Release ${tag} …`)
    const publishArgs = buildGhReleaseCreateArgs({
      tag,
      assetPaths: assets.map((asset) => asset.path),
      target: args.target === 'HEAD' ? head : args.target,
      title,
      notesFile: notesPath,
      prerelease: isPrereleaseTag(tag)
    })
    exec('gh', publishArgs, { cwd, stdio: 'inherit' })

    const readback = JSON.parse(
      exec('gh', ['release', 'view', tag, '--json', 'url,tagName,isDraft,isPrerelease,assets'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
    log('')
    log(`已发布：${readback.url}`)
    log(
      `  tag ${readback.tagName} · prerelease ${readback.isPrerelease} · 资产 ${readback.assets.length}`
    )
    for (const asset of readback.assets) {
      log(`    - ${asset.name} (${asset.size} bytes)`)
    }
    return { mode: 'publish', tag, version, readback }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function main() {
  await runWorkbenchRelease({ argv: process.argv.slice(2) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
