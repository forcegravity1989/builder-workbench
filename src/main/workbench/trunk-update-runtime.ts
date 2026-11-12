import { readdir } from 'node:fs/promises'
import { parseExecutionHostId } from '../../shared/execution-host'
import { runWithGitWorktreeOperationLock } from '../../shared/git-worktree-operation-lock'
import { stripCredentialsFromMessage } from '../../shared/git-remote-error'
import type { MetricScope } from '../../shared/workbench/metrics'
import type { TrunkUpdateResult } from '../../shared/workbench/trunk-update'
import { extractExecError } from '../git/exec-error'
import { gitOptionsForWorktree, gitReadOptionsForWorktree } from '../git/git-runtime-options'
import {
  postponeRepoRefMaintenance,
  withRepoRefMaintenancePaused
} from '../git/local-repo-ref-maintenance'
import { gitExecFileAsync } from '../git/runner'
import {
  detectConflictOperation,
  resolveGitDir,
  runWithGitReadCacheInvalidation
} from '../git/status'
import {
  prepareFlowUpdate,
  readBranchSignatureOption,
  readFlowUpstream,
  type FlowUpdate
} from './flow-trunk-sync'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import { runTrunkBaseline } from './trunk-baseline'
import {
  compareTrunk,
  decideTrunkUpdate,
  fetchTrunkSource,
  readTrunkCheckout,
  trunkRefusalSentence,
  trunkSyncSource,
  TRUNK_SYNC_TIMEOUT_MS,
  TRUNK_UPDATE_BUDGET_MS,
  type TrunkCheckoutState,
  type TrunkSyncSource
} from './trunk-sync'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

type TrunkUpdateRuntime = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

function failureDetail(error: unknown): string {
  const { stderr, stdout } = extractExecError(error)
  const detail = (stderr || stdout)
    .trim()
    .split('\n')
    .findLast((line) => line.trim())
  return stripCredentialsFromMessage(
    detail?.trim() || (error instanceof Error ? error.message : String(error))
  ).slice(-160)
}

function refuse(reason: string): TrunkUpdateResult {
  return { updated: false, pulled: 0, reason }
}

export function createTrunkUpdateService(runtime: TrunkUpdateRuntime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  return {
    async updateCode(scope: MetricScope): Promise<TrunkUpdateResult> {
      const signal = AbortSignal.timeout(TRUNK_UPDATE_BUDGET_MS)
      const { target, repo, reauthorize } = await resolver.resolve(scope)
      if (parseExecutionHostId(target.hostId)?.kind !== 'local') {
        return refuse('代码未更新（远程工作树暂不支持自动同步）。请在会话中处理。')
      }

      const options = { ...resolveWorkbenchGitExecOptions(runtime, repo), signal }
      const isTrunk = target.isMainWorktree
      const treePath = isTrunk ? target.repoPath : target.worktreePath
      const read = (args: string[]) =>
        gitExecFileAsync(args, { ...gitReadOptionsForWorktree(treePath, options), timeout: 30_000 })
      const run = (args: string[]) =>
        gitExecFileAsync(args, {
          ...gitOptionsForWorktree(treePath, options),
          timeout: TRUNK_SYNC_TIMEOUT_MS,
          terminationBarrier: true
        })
      let checkout: TrunkCheckoutState | undefined
      const next = () =>
        checkout ? `请让会话模型处理 ${checkout.branch} 分支的代码更新。` : '请在会话中处理。'

      try {
        const baseline = await runTrunkBaseline(
          target.repoPath,
          repo.worktreeBaseRef ?? null,
          options
        )
        if (!baseline.sync) {
          return refuse(
            `代码未更新（基线 ${baseline.ref} 不是可同步的远端分支）。请在项目设置核对基线分支。`
          )
        }
        const start = await readTrunkCheckout(read)
        checkout = start
        const trunk = trunkSyncSource(baseline.sync)
        const upstream = isTrunk ? null : await readFlowUpstream(read, start.branch)

        const fetchSource = async (source: TrunkSyncSource) => {
          try {
            return await fetchTrunkSource(target.repoPath, source, options)
          } catch (reason) {
            throw new Error(
              `无法获取 ${source.remoteName}/${source.branchName} 的最新提交：${failureDetail(reason)}`
            )
          }
        }
        const sources = [await fetchSource(trunk)]
        if (
          upstream &&
          (upstream.remoteName !== trunk.remoteName || upstream.branchName !== trunk.branchName)
        ) {
          sources.push(await fetchSource(upstream))
        }

        return await runWithGitWorktreeOperationLock(treePath, signal, async () => {
          const assertCheckout = async () => {
            await reauthorize()
            const current = await readTrunkCheckout(read)
            if (current.branch !== start.branch || current.head !== start.head) {
              throw new Error('工作树分支或提交已变化，请重试')
            }
            const [operation, gitEntries] = await Promise.all([
              detectConflictOperation(treePath, options),
              resolveGitDir(treePath, options).then((directory) => readdir(directory))
            ])
            if (
              operation !== 'unknown' ||
              gitEntries.some(
                (entry) =>
                  entry === 'REVERT_HEAD' || entry === 'sequencer' || entry === 'BISECT_START'
              )
            ) {
              throw new Error('工作树已有进行中的 Git 操作')
            }
          }
          await assertCheckout()
          const signatureOption = await readBranchSignatureOption(read, start.branch)

          let ref = start.branch
          let update: FlowUpdate
          if (isTrunk) {
            ref = baseline.ref
            const commit = sources[0].commit
            const comparison = await compareTrunk(read, start.head, commit)
            const status = await read(['status', '--porcelain', '--untracked-files=no'])
            const context = {
              ...comparison,
              branch: start.branch,
              baselineBranch: trunk.branchName
            }
            const decision = decideTrunkUpdate({ ...context, dirty: Boolean(status.stdout.trim()) })
            if (decision.action === 'refuse') {
              return refuse(trunkRefusalSentence(decision.reason, context))
            }
            update = {
              commit,
              pulled: decision.action === 'current' ? 0 : decision.behind,
              merged: false
            }
          } else {
            update = await prepareFlowUpdate(read, start.head, sources, {
              repoPath: target.repoPath,
              treePath,
              options,
              signatureOption
            })
          }

          if (update.commit === start.head) {
            return { updated: true, pulled: 0, ref }
          }

          postponeRepoRefMaintenance()
          return withRepoRefMaintenancePaused('git-fast-forward', () =>
            runWithGitReadCacheInvalidation(async () => {
              if (
                isTrunk &&
                (await read(['status', '--porcelain', '--untracked-files=no'])).stdout.trim()
              ) {
                return refuse(
                  trunkRefusalSentence('dirty-trunk', {
                    branch: start.branch,
                    baselineBranch: trunk.branchName,
                    ahead: 0
                  })
                )
              }
              await assertCheckout()

              // Let Git apply one fast-forward, with draft preservation and no
              // branch options that can stash or stage a different result.
              const applied = await run([
                '-c',
                `branch.${start.branch}.mergeOptions=`,
                '-c',
                'merge.autostash=false',
                'merge',
                '--ff-only',
                '--no-overwrite-ignore',
                // The isolated native merges already verified their incoming tips.
                ...(update.merged
                  ? ['--no-verify-signatures']
                  : signatureOption
                    ? [signatureOption]
                    : []),
                update.commit
              ]).then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error })
              )

              // A post-merge hook can time out after Git has already advanced HEAD.
              const readBackSignal = AbortSignal.timeout(15_000)
              const end = await readTrunkCheckout((args) =>
                gitExecFileAsync(
                  args,
                  gitReadOptionsForWorktree(treePath, { ...options, signal: readBackSignal })
                )
              ).catch(() => null)
              if (end?.branch === start.branch && end.head === update.commit) {
                return { updated: true, ref, ...update }
              }
              if (!applied.ok && end?.branch === start.branch && end.head === start.head) {
                throw applied.error
              }
              return refuse(`无法确认代码更新（未读到预期的分支和提交）。${next()}`)
            })
          )
        })
      } catch (reason) {
        return refuse(`代码未更新（${failureDetail(reason)}）。${next()}`)
      }
    }
  }
}
