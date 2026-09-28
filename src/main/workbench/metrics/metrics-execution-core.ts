import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
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
import { resolveAdoptedBaseline } from '../history-git-core'

export const METRICS_CONFIGURATION_PATH = '.bw/metrics.toml'
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
  /** Head of the adopted source at read time — the real data target, never the checkout. */
  dataCommit: string
  toml: string | null
  /** IANA timezone of the host that executed the read. */
  timezone: string
}

/**
 * Reads .bw/metrics.toml from a fixed revision of the adopted source. Without
 * an explicit configurationCommit the current adopted head pins the catalog;
 * with one, that revision must already be merged into the adopted source, so a
 * configuration draft can never become an official reading source.
 */
export async function readMetricConfiguration(input: {
  repoPath: string
  adoptedRef: string | null
  configurationCommit?: string
  execOptions?: MetricsExecOptions
}): Promise<MetricConfigurationSnapshot> {
  const { repoPath, execOptions = {} } = input
  const exec = repoExec(repoPath, execOptions)
  const baseline = await resolveAdoptedBaseline(exec, input.adoptedRef)
  let configurationCommit = baseline.commit
  if (input.configurationCommit) {
    configurationCommit = input.configurationCommit
    if (configurationCommit !== baseline.commit) {
      try {
        await exec(['merge-base', '--is-ancestor', configurationCommit, baseline.commit])
      } catch {
        throw new MetricCollectorError(
          'configuration-not-adopted',
          '该配置修订不在项目正式采用来源上，试采草稿不能作为正式读数来源'
        )
      }
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
  return {
    configurationRef: baseline.ref,
    configurationCommit,
    dataCommit: baseline.commit,
    // A binary metrics.toml is a broken configuration, not an absent one; the
    // decoder reports it as unparseable instead of "not configured".
    toml: blob.exists ? (blob.isBinary ? '' : blob.content) : null,
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
      throw new MetricCollectorError('execution-root-invalid', '执行根与已采用配置修订不一致')
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
