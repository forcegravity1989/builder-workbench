import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import { gitExecFileAsync } from '../../git/runner'
import { readGitBlobAtOidPath } from '../../git/source-control/git-blob-read'
import {
  discardPreparedWorktree,
  prepareWorktreeCreateCheckout
} from '../../git/worktree-create-preparation'
import { runWslProcess } from '../../wsl/wsl-runner'
import { runProcess } from '../../../shared/child-process/run-process'
import { isWindowsAbsolutePathLike } from '../../../shared/cross-platform-path'
import { toLinuxPath } from '../../../shared/wsl-paths'
import {
  WORKTREE_CREATE_PREPARATION_DIRECTORY,
  createWorktreePreparationLockReason
} from '../../../shared/worktree/create-preparation'
import type { GitWorktreeExecOptions } from '../../git/worktree-operation-options'
import { MetricCollectorError } from './collector-output'
import { resolveTrunkBaseline } from '../trunk-baseline'

export const METRICS_CONFIGURATION_PATH = '.bw/metrics.toml'
/** Fixed branch the「配置指标」session edits. Must match the renderer maintenance branch. */
export const METRICS_MAINTENANCE_BRANCH = 'bw/metrics-refresh'
/** Protocol default for collector scripts; must stay below the renderer's 910s RPC budget. */
export const METRICS_COLLECT_TIMEOUT_MS = 900_000

export type MetricsExecOptions = GitWorktreeExecOptions

function pathOpsFor(repoPath: string) {
  return isWindowsAbsolutePathLike(repoPath) ? win32 : posix
}

function repoExec(repoPath: string, options: MetricsExecOptions) {
  return (argv: string[]) =>
    gitExecFileAsync(argv, { ...options, cwd: repoPath, timeout: options.timeout ?? 30_000 })
}

/**
 * Where the throwaway collector checkout goes: the repo's registered worktree
 * base when it has one, otherwise a sibling of the repo, following the native
 * repo-qualified sibling convention for remote placement. The preparation
 * directory name plus the preparation lock reason keep native listings and
 * stale cleanup recognizing it.
 */
export function computeMetricsCheckoutRoot(repoPath: string, worktreeBasePath?: string): string {
  const pathOps = pathOpsFor(repoPath)
  const base = worktreeBasePath?.trim()
  if (base) {
    return pathOps.isAbsolute(base) ? base : pathOps.join(repoPath, base)
  }
  return pathOps.join(repoPath, '..')
}

export type MetricConfigurationSnapshot = {
  configurationRef: string
  configurationCommit: string
  /** Trunk baseline head at read time — the real data target, never the checkout. */
  dataCommit: string
  toml: string | null
  /**
   * Hash of the maintenance worktree file when the scoreboard is showing that
   * uncommitted text. Null when the catalog is exactly the resolved commit.
   * Readings never use this text; collection keeps the commit.
   */
  draft: string | null
  /** IANA timezone of the host that executed the read. */
  timezone: string
}

async function revParse(exec: ReturnType<typeof repoExec>, ref: string): Promise<string | null> {
  try {
    const commit = (await exec(['rev-parse', '--verify', `${ref}^{commit}`])).stdout.trim()
    return commit || null
  } catch {
    return null
  }
}

async function maintenanceWorktreePath(exec: ReturnType<typeof repoExec>): Promise<string | null> {
  const { stdout } = await exec(['worktree', 'list', '--porcelain'])
  for (const block of stdout.split('\n\n')) {
    const path = /^worktree (.*)$/m.exec(block)?.[1]
    const branch = /^branch (.*)$/m.exec(block)?.[1]
    if (path && branch === `refs/heads/${METRICS_MAINTENANCE_BRANCH}`) {
      return path
    }
  }
  return null
}

async function isAncestor(
  exec: ReturnType<typeof repoExec>,
  ancestor: string,
  descendant: string
): Promise<boolean> {
  try {
    await exec(['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch {
    return false
  }
}

/**
 * A clean maintenance tree that is strictly behind the trunk baseline is
 * fast-forwarded onto that baseline, so「配置指标」edits the catalog the
 * scoreboard is showing. Dirty or diverged trees are left untouched.
 */
export async function catchUpMetricsMaintenance(input: {
  repoPath: string
  baselineCommit: string
  execOptions?: MetricsExecOptions
}): Promise<void> {
  const exec = repoExec(input.repoPath, input.execOptions ?? {})
  const head = await revParse(exec, `refs/heads/${METRICS_MAINTENANCE_BRANCH}`)
  if (
    !head ||
    head === input.baselineCommit ||
    !(await isAncestor(exec, head, input.baselineCommit))
  ) {
    return
  }
  let worktreePath: string | null
  try {
    worktreePath = await maintenanceWorktreePath(exec)
  } catch {
    return
  }
  const git = (cwd: string, argv: string[]) =>
    gitExecFileAsync(argv, { ...input.execOptions, cwd, timeout: 30_000 })
  if (worktreePath) {
    try {
      await git(worktreePath, ['diff', '--quiet', 'HEAD'])
      await git(worktreePath, ['diff', '--cached', '--quiet'])
    } catch {
      return
    }
    await git(worktreePath, ['merge', '--ff-only', input.baselineCommit])
    return
  }
  await exec(['update-ref', `refs/heads/${METRICS_MAINTENANCE_BRANCH}`, input.baselineCommit])
}

/**
 * Reads .bw/metrics.toml from a fixed revision. No fetch. Without an explicit
 * configurationCommit, a maintenance commit that already contains the trunk
 * baseline supplies the catalog; otherwise the trunk head does. Collection
 * always passes that commit and ignores the worktree. The scoreboard preview
 * additionally reads the maintenance worktree file, so an unsaved edit shows
 * up there and is marked as a draft instead of becoming a reading.
 */
export async function readMetricConfiguration(input: {
  repoPath: string
  pinnedRef: string | null
  configurationCommit?: string
  /** Scoreboard only: show the maintenance worktree file when it differs. */
  previewMaintenanceWorktree?: boolean
  execOptions?: MetricsExecOptions
}): Promise<MetricConfigurationSnapshot> {
  const { repoPath, execOptions = {} } = input
  const exec = repoExec(repoPath, execOptions)
  const baseline = await resolveTrunkBaseline(exec, input.pinnedRef)
  let configurationCommit = input.configurationCommit ?? baseline.commit
  let configurationRef = baseline.ref
  if (!input.configurationCommit) {
    const maintenance = await revParse(exec, `refs/heads/${METRICS_MAINTENANCE_BRANCH}`)
    if (
      maintenance &&
      maintenance !== baseline.commit &&
      (await isAncestor(exec, baseline.commit, maintenance))
    ) {
      configurationCommit = maintenance
      configurationRef = METRICS_MAINTENANCE_BRANCH
    }
  }
  const blob = await readGitBlobAtOidPath(
    repoPath,
    configurationCommit,
    METRICS_CONFIGURATION_PATH,
    execOptions
  )
  if (blob.failed) {
    throw new MetricCollectorError('configuration-unreadable', '指标配置读取失败，来源未给出答案')
  }
  // A binary metrics.toml is a broken configuration, not an absent one; the
  // decoder reports it as unparseable instead of "not configured".
  let toml = blob.exists ? (blob.isBinary ? '' : blob.content) : null
  let draft: string | null = null
  if (input.previewMaintenanceWorktree && !input.configurationCommit) {
    let worktreePath: string | null = null
    try {
      worktreePath = await maintenanceWorktreePath(exec)
    } catch {
      worktreePath = null
    }
    if (worktreePath) {
      try {
        const file = await readFile(
          pathOpsFor(repoPath).join(worktreePath, '.bw', 'metrics.toml'),
          'utf8'
        )
        if (file !== (toml ?? '')) {
          toml = file
          draft = createHash('sha256').update(file).digest('hex')
          configurationRef = METRICS_MAINTENANCE_BRANCH
        }
      } catch {
        // No readable file in the worktree: keep the committed catalog.
      }
    }
  }
  return {
    configurationRef,
    configurationCommit,
    dataCommit: baseline.commit,
    toml,
    draft,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
}

/**
 * Execution fingerprint binding the configuration commit to the actual script
 * and dependency blobs it declares in `run`; comparable only when both match.
 */
export async function fingerprintMetricCollector(input: {
  repoPath: string
  configurationCommit: string
  run: readonly string[]
  execOptions?: MetricsExecOptions
}): Promise<string> {
  const exec = repoExec(input.repoPath, input.execOptions ?? {})
  const blobs: { path: string; blob: string }[] = []
  for (const token of input.run) {
    if (!token || token.startsWith('-')) {
      continue
    }
    try {
      const { stdout } = await exec(['ls-tree', input.configurationCommit, '--', token])
      const match = /^\d+ blob ([a-f0-9]{40,64})\t/.exec(stdout)
      if (match) {
        blobs.push({ path: token, blob: match[1] })
      }
    } catch {
      // A run token that is not a repo path (an interpreter name) has no blob.
    }
  }
  blobs.sort((left, right) => left.path.localeCompare(right.path))
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ configurationCommit: input.configurationCommit, blobs }))
    .digest('hex')}`
}

export type MetricProcessOutcome = {
  stdout: string
  stderr: string
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  outputTruncated: boolean
}

/**
 * Runs one collection inside a throwaway checkout of the fixed configuration
 * revision: preparation lock, HEAD verification against the pinned commit,
 * argv execution with the protocol env, and discard in finally — never the
 * TTL preparation pool, and never the caller's working trees.
 */
export async function executeMetricCollection(input: {
  repoPath: string
  checkoutRoot: string
  configurationCommit: string
  run: readonly string[]
  args: readonly string[]
  env: Readonly<Record<string, string>>
  timeoutMs: number
  execOptions?: MetricsExecOptions
}): Promise<MetricProcessOutcome> {
  const { repoPath, execOptions = {} } = input
  const pathOps = pathOpsFor(repoPath)
  const preparationId = `${process.pid}-${randomUUID()}`
  const checkoutPath = pathOps.join(
    input.checkoutRoot,
    WORKTREE_CREATE_PREPARATION_DIRECTORY,
    preparationId
  )
  const wsl = execOptions.wslDistro
    ? { distro: execOptions.wslDistro, guestCwd: toLinuxPath(checkoutPath) }
    : null
  await mkdir(pathOps.join(input.checkoutRoot, WORKTREE_CREATE_PREPARATION_DIRECTORY), {
    recursive: true
  })
  await prepareWorktreeCreateCheckout(
    repoPath,
    checkoutPath,
    input.configurationCommit,
    createWorktreePreparationLockReason(preparationId),
    execOptions
  )
  let outcome: MetricProcessOutcome
  try {
    const head = (
      await gitExecFileAsync(['rev-parse', '--verify', 'HEAD'], {
        ...execOptions,
        cwd: checkoutPath,
        timeout: execOptions.timeout ?? 30_000
      })
    ).stdout.trim()
    if (head !== input.configurationCommit) {
      throw new MetricCollectorError('execution-root-invalid', '执行根与指定配置修订不一致')
    }
    const args = [...input.run.slice(1), ...input.args]
    outcome = wsl
      ? await runWslProcess({
          program: input.run[0],
          args,
          distro: wsl.distro,
          cwd: wsl.guestCwd,
          env: input.env,
          loginPath: 'preferred',
          timeoutMs: input.timeoutMs
        }).then((result) => ({
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code,
          signal: null,
          timedOut: result.timedOut,
          outputTruncated: result.outputTruncated
        }))
      : await runProcess({
          program: input.run[0],
          args,
          cwd: checkoutPath,
          env: { ...process.env, ...input.env },
          timeoutMs: input.timeoutMs
        }).then((result) => ({
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code,
          signal: result.signal,
          timedOut: result.timedOut,
          outputTruncated: result.outputTruncated === true
        }))
  } finally {
    await discardPreparedWorktree(repoPath, checkoutPath, execOptions).catch(() => {
      // The preparation lock reason keeps the stranded tree recognizable to the
      // native stale-preparation cleanup; the run outcome stays the primary fact.
    })
  }
  return outcome
}
