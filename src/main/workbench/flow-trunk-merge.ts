import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveWorktreeHostPath } from '../../shared/git-metadata-path'
import { SourceCommit } from '../../shared/workbench/version-material'
import {
  createWorktreePreparationLockReason,
  WORKTREE_CREATE_PREPARATION_DIRECTORY
} from '../../shared/worktree/create-preparation'
import { extractExecError } from '../git/exec-error'
import { gitOptionsForWorktree, type GitRuntimeOptions } from '../git/git-runtime-options'
import { gitExecFileAsync } from '../git/runner'
import {
  discardPreparedWorktree,
  prepareWorktreeCreateCheckout
} from '../git/worktree-create-preparation'
import { TRUNK_SYNC_TIMEOUT_MS, type FetchedTrunkSource } from './trunk-sync'

export type FlowMergeContext = {
  repoPath: string
  treePath: string
  options: GitRuntimeOptions
  signatureOption?: string
}

async function readMergeConfig(treePath: string, options: GitRuntimeOptions): Promise<string[]> {
  try {
    const { stdout } = await gitExecFileAsync(
      [
        'config',
        '--null',
        '--get-regexp',
        '^(merge\\..+|gpg\\..+|commit\\.gpgsign|user\\.(name|email|signingkey))$'
      ],
      { ...gitOptionsForWorktree(treePath, options), timeout: TRUNK_SYNC_TIMEOUT_MS }
    )
    return stdout
      .split('\0')
      .filter(Boolean)
      .flatMap((record) => {
        const newline = record.indexOf('\n')
        return newline === -1
          ? ['-c', record]
          : ['-c', `${record.slice(0, newline)}=${record.slice(newline + 1)}`]
      })
  } catch (reason) {
    if (typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 1) {
      return []
    }
    throw reason
  }
}

export async function mergeFlowSources(
  { repoPath, treePath, options, signatureOption }: FlowMergeContext,
  head: string,
  forward: FetchedTrunkSource | undefined,
  pending: FetchedTrunkSource[]
): Promise<string> {
  const hostPath = resolveWorktreeHostPath(treePath, options) ?? treePath
  const preparationRoot = path.join(path.dirname(hostPath), WORKTREE_CREATE_PREPARATION_DIRECTORY)
  const preparationId = `${process.pid}-${randomUUID()}`
  const checkout = path.join(preparationRoot, preparationId)
  // Older Git may not copy worktree-specific config into a new checkout.
  const mergeConfig = await readMergeConfig(treePath, options)
  await mkdir(preparationRoot, { recursive: true })
  await prepareWorktreeCreateCheckout(
    treePath,
    checkout,
    head,
    createWorktreePreparationLockReason(preparationId),
    options
  )

  const run = (args: string[]) =>
    gitExecFileAsync(args, {
      ...gitOptionsForWorktree(checkout, options),
      timeout: TRUNK_SYNC_TIMEOUT_MS,
      terminationBarrier: true
    })

  let commit: string | undefined
  let failure: unknown
  try {
    for (const source of forward ? [forward, ...pending] : pending) {
      try {
        await run([
          ...mergeConfig,
          '-c',
          'merge.autostash=false',
          '-c',
          'rerere.enabled=false',
          'merge',
          source === forward ? '--ff-only' : '--no-ff',
          '--no-edit',
          '--commit',
          '--no-overwrite-ignore',
          ...(signatureOption ? [signatureOption] : []),
          '-m',
          `Merge ${source.ref}`,
          source.commit
        ])
      } catch (reason) {
        const { stderr, stdout } = extractExecError(reason)
        if (/^CONFLICT\b|^Automatic merge failed\b/m.test(`${stdout}\n${stderr}`)) {
          throw new Error(`合并 ${source.ref} 时发生冲突`)
        }
        const detail = (stderr || stdout)
          .trim()
          .split('\n')
          .findLast((line) => line.trim())
        throw new Error(`无法合并 ${source.ref}${detail ? `：${detail.trim()}` : ''}`, {
          cause: reason
        })
      }
    }
    commit = SourceCommit.parse(
      (await run(['rev-parse', '--verify', 'HEAD^{commit}'])).stdout.trim()
    )
  } catch (reason) {
    failure = reason
  }
  try {
    await discardPreparedWorktree(repoPath, checkout, { ...options, timeout: 20_000 })
  } catch (reason) {
    const detail = failure instanceof Error ? `${failure.message}。` : ''
    throw new Error(`${detail}临时工作树清理失败`, { cause: reason })
  }
  if (!commit) {
    throw failure
  }
  return commit
}
