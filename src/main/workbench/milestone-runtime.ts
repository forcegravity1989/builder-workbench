import type { Repo } from '../../shared/repo-types'
import { unlink } from 'node:fs/promises'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../shared/execution-host'
import { runWithGitWorktreeOperationLock } from '../../shared/git-worktree-operation-lock'
import { CHARTER_BRANCH } from '../../shared/workbench/project-charter'
import {
  MILESTONES_PATH,
  MilestoneMaterialSchema,
  milestoneDraft,
  milestoneProblems,
  milestoneWorkingDraft,
  type MilestoneDiscard,
  type MilestoneRead,
  type MilestoneSave,
  type MilestoneSubmit,
  type MilestoneSubmitResult
} from '../../shared/workbench/project-milestones'
import type { RuntimeWorktreeListResult } from '../../shared/runtime-worktree-contracts'
import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree } from '../git/git-runtime-options'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { detectConflictOperation, runWithGitReadCacheInvalidation } from '../git/status'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { invalidateHostedReviewBranchCache } from '../source-control/hosted-review-branch-cache'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceScope
} from './workspace-resolver'
import type { CharterRuntimeHost } from './charter-runtime'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import { runTrunkBaseline } from './trunk-baseline'
import { trunkSyncSource } from './trunk-sync'
import { serializeCharterSubmission } from './charter-submit-queue'
import { createCharterReview } from './charter-create-review'
import { readCharterStatus } from './charter-pr-status'
import { oneLine } from './charter-remote-probe'
import { readMilestoneSnapshot } from './milestone-snapshot'
import {
  assertMilestoneRevision,
  readMilestoneDocument,
  saveMilestoneDocument,
  withMilestoneDocumentLock
} from './milestone-document'
import { validateMilestoneSubmission } from './milestone-submit-validation'

type Runtime = CharterRuntimeHost & {
  listManagedWorktrees(repo: string, limit: number): Promise<RuntimeWorktreeListResult>
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const formalReads = new WeakMap<Runtime, Map<string, ReturnType<typeof readMilestoneSnapshot>>>()

export function nativeMilestoneService(runtime: Runtime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))

  async function resolve(scope: WorkbenchWorkspaceScope) {
    const c = await resolver.resolve(scope)
    if (parseExecutionHostId(c.target.hostId)?.kind === 'ssh') {
      throw new Error('此宿主的项目材料尚未接入，请在所属运行环境打开项目。')
    }
    return { ...c, options: resolveWorkbenchGitExecOptions(runtime, c.repo) }
  }

  async function openProject(scope: WorkbenchWorkspaceScope) {
    const c = await resolve(scope)
    const root = c.target.worktreePath
    const git = async (args: string[]) =>
      (
        await gitExecFileAsync(args, { ...gitOptionsForWorktree(root, c.options), timeout: 90_000 })
      ).stdout.trim()
    const authorize = async () => {
      await c.reauthorize()
      if (c.target.isMainWorktree || (await git(['branch', '--show-current'])) !== CHARTER_BRANCH) {
        throw new Error('请使用原生登记的项目材料工作树。')
      }
    }
    await authorize()
    return { ...c, root, git, authorize }
  }

  async function readWorktrees(repoId: string) {
    const result = await runtime.listManagedWorktrees(`id:${repoId}`, 10_000)
    if (result.truncated || result.totalCount > result.worktrees.length) {
      throw new Error('项目工作树未完整读取，请重试。')
    }
    return {
      trees: result.worktrees,
      started: new Set(
        result.worktrees.flatMap((t) =>
          t.workbenchVersionBinding ? [t.workbenchVersionBinding.version] : []
        )
      )
    }
  }

  async function read(
    scope: WorkbenchWorkspaceScope,
    includeProject = false
  ): Promise<MilestoneRead> {
    const c = await resolve(scope)
    const [baseline, { trees, started }] = await Promise.all([
      runTrunkBaseline(c.repo.path, c.repo.worktreeBaseRef ?? null, c.options),
      readWorktrees(c.repo.id)
    ])
    const pending = formalReads.get(runtime) ?? new Map()
    formalReads.set(runtime, pending)
    const key = JSON.stringify([
      c.target.hostId,
      c.repo.id,
      c.repo.path,
      c.options.wslDistro,
      baseline.commit,
      [...started].sort()
    ])
    let snapshot = pending.get(key)
    if (!snapshot) {
      // A formal preview and a full read can share the same pinned Git material.
      snapshot = readMilestoneSnapshot(c.repo.path, baseline.commit, c.options, started).finally(
        () => pending.delete(key)
      )
      pending.set(key, snapshot)
    }
    const [formal, status] = await Promise.all([
      snapshot,
      includeProject ? readCharterStatus(c.repo, c.options) : null
    ])
    if (!status) {
      return {
        formal: formal.snapshot,
        project: null,
        review: { pr: null, remoteAvailable: null }
      }
    }
    const sameReviewBase = !status.reviewBase || status.reviewBase === baseline.sync?.branchName
    const review = status.pr?.state === 'open' && sameReviewBase ? status.pr : null
    const projectTrees = trees.filter(
      (tree) =>
        !tree.isArchived &&
        !tree.isMainWorktree &&
        getWorktreeExecutionHostId(tree, c.repo) === c.target.hostId &&
        (tree.branch === CHARTER_BRANCH || tree.branch === `refs/heads/${CHARTER_BRANCH}`)
    )
    if (projectTrees.length > 1) {
      throw new Error('存在多个项目材料工作树，请核对登记。')
    }
    const tree = projectTrees[0]
    let project: MilestoneRead['project'] = null
    if (tree) {
      const source = await openProject({ ...scope, worktreeId: tree.id })
      const head = await source.git(['rev-parse', 'HEAD'])
      const committed =
        head === baseline.commit
          ? formal
          : await readMilestoneSnapshot(c.repo.path, head, c.options, started)
      const trackedTrunk = baseline.sync
        ? await source.git([
            'for-each-ref',
            '--format=%(objectname)',
            trunkSyncSource(baseline.sync).trackingRef
          ])
        : ''
      const contents = committed.contents.get(MILESTONES_PATH)
      const trackedBlob =
        trackedTrunk && trackedTrunk !== baseline.commit
          ? await readGitBlobAtOidPath(c.repo.path, trackedTrunk, MILESTONES_PATH, c.options)
          : null
      const incorporated =
        contents !== undefined &&
        (contents === formal.contents.get(MILESTONES_PATH) ||
          (!!trackedBlob?.exists &&
            !trackedBlob.failed &&
            !trackedBlob.isBinary &&
            contents === trackedBlob.content.replace(/\r\n/g, '\n')) ||
          (sameReviewBase && status.mergedHeadOid === head))
      const projectHasChanges =
        contents !== undefined &&
        !incorporated &&
        !!(await source.git([
          'log',
          '-1',
          '--format=%H',
          `${trackedTrunk || baseline.commit}..${head}`,
          '--',
          MILESTONES_PATH
        ]))
      const upstream = await source.git([
        'for-each-ref',
        '--format=%(objectname)',
        `refs/remotes/origin/${CHARTER_BRANCH}`
      ])
      const unpublished =
        !!upstream &&
        upstream !== head &&
        !!(await source.git([
          'log',
          '-1',
          '--format=%H',
          `${upstream}..${head}`,
          '--',
          MILESTONES_PATH
        ]))
      const reviewed = Boolean(projectHasChanges && review && status.reviewHeadOid === head)
      const working = await readMilestoneDocument(source.root).then(
        (file) =>
          !file.material && committed.contents.has(MILESTONES_PATH)
            ? {
                working: null,
                workingError: '里程碑文件已从项目材料工作树移除。请在工作树中核对。'
              }
            : { working: file },
        (error: unknown) => ({ working: null, workingError: message(error) })
      )
      project = {
        worktreeId: tree.id,
        committed: committed.snapshot,
        ...working,
        incorporated,
        reviewed,
        pendingReview: projectHasChanges && (unpublished || !review)
      }
    }
    return {
      formal: formal.snapshot,
      project,
      review: {
        pr: review,
        queryFailed: status.queryFailed,
        remoteAvailable: status.remoteAvailable
      }
    }
  }

  async function working(scope: WorkbenchWorkspaceScope) {
    const c = await openProject(scope)
    return readMilestoneDocument(c.root)
  }

  async function save(input: MilestoneSave) {
    const c = await openProject(input.scope)
    return runWithGitWorktreeOperationLock(c.root, undefined, () =>
      saveMilestoneDocument(c.root, input, c.authorize)
    )
  }

  async function discard(input: MilestoneDiscard) {
    const c = await openProject(input.scope)
    return runWithGitWorktreeOperationLock(c.root, undefined, () =>
      withMilestoneDocumentLock(c.root, async (file, isCurrent) => {
        await c.authorize()
        const tracked =
          (await c.git(['ls-tree', 'HEAD', '--', MILESTONES_PATH])) ||
          (await c.git(['ls-files', '--', MILESTONES_PATH]))
        const workingFile = await readMilestoneDocument(c.root)
        assertMilestoneRevision(workingFile, input.expectedRevision)
        if (!isCurrent() || (await detectConflictOperation(c.root, c.options)) !== 'unknown') {
          throw new Error('工作树正在执行其他操作，当前修改已保留。')
        }
        await runWithGitReadCacheInvalidation(async () => {
          if (tracked) {
            await c.git([
              'restore',
              '--source=HEAD',
              '--staged',
              '--worktree',
              '--',
              MILESTONES_PATH
            ])
          } else if (workingFile.revision) {
            await unlink(file)
          }
        })
        return readMilestoneDocument(c.root)
      })
    )
  }

  async function submit(input: MilestoneSubmit): Promise<MilestoneSubmitResult> {
    return serializeCharterSubmission(
      JSON.stringify([input.scope.hostId, input.scope.repoId]),
      async () => {
        const c = await openProject(input.scope)
        const { git } = c
        const identity = await probeGitRemoteIdentity(
          c.repo.path,
          getRepoExecutionHostId(c.repo as Repo)
        )
        if (identity.status !== 'resolved') {
          throw new Error('未确认代码仓远端，里程碑已保存在工作树。恢复连接后再提交。')
        }
        return runWithGitWorktreeOperationLock(c.root, undefined, async () => {
          await c.authorize()
          const workingFile = await readMilestoneDocument(c.root)
          assertMilestoneRevision(workingFile, input.expectedRevision)
          const { started } = await readWorktrees(c.repo.id)
          const head = await git(['rev-parse', 'HEAD'])
          const committed = await readMilestoneSnapshot(c.repo.path, head, c.options, started)
          const draft = milestoneWorkingDraft(workingFile, committed.snapshot)
          const material = MilestoneMaterialSchema.safeParse(workingFile.material)
          const problems = milestoneProblems(draft, milestoneDraft(committed.snapshot))
          if (problems.length || !material.success) {
            throw new Error(problems.join('；') || '请补全里程碑文件后再提交。')
          }
          const baseline = await runTrunkBaseline(
            c.repo.path,
            c.repo.worktreeBaseRef ?? null,
            c.options
          )
          const formal =
            baseline.commit === head
              ? committed
              : await readMilestoneSnapshot(c.repo.path, baseline.commit, c.options, started)
          validateMilestoneSubmission(committed, formal, draft, started)
          if (
            (await detectConflictOperation(c.root, c.options)) !== 'unknown' ||
            (await git(['ls-files', '-u']))
          ) {
            throw new Error('项目材料工作树有尚未完成的 Git 操作。请在工作树中处理后再提交。')
          }
          const paths = await withMilestoneDocumentLock(c.root, async (_file, isCurrent) => {
            await c.authorize()
            const status = await git(['status', '--porcelain', '--', MILESTONES_PATH])
            const blob = await git([
              'hash-object',
              `--path=${MILESTONES_PATH}`,
              '--',
              MILESTONES_PATH
            ])
            assertMilestoneRevision(await readMilestoneDocument(c.root), input.expectedRevision)
            if (!isCurrent()) {
              throw new Error('文件锁已失效，请重新读取后再提交。')
            }
            if (!status) {
              return []
            }
            await runWithGitReadCacheInvalidation(async () => {
              await git(['add', '--intent-to-add', '--', MILESTONES_PATH])
              await git([
                'commit',
                '--only',
                '-m',
                '更新项目里程碑与版本排期',
                '--',
                MILESTONES_PATH
              ])
            })
            if ((await git(['rev-parse', `HEAD:${MILESTONES_PATH}`])) !== blob) {
              throw new Error('本地提交与已核对的里程碑文件不同，请在工作树中核对后再推送。')
            }
            return [MILESTONES_PATH]
          })
          try {
            await git(['push', '-u', 'origin', CHARTER_BRANCH])
          } catch (error) {
            return {
              outcome: {
                mode: 'failed',
                stage: 'push',
                error: `改动仍在工作树，推送未成功。${oneLine(message(error))}`,
                filled: paths
              }
            }
          }
          const outcome = await createCharterReview({
            repo: c.repo,
            executionHostId: getRepoExecutionHostId(c.repo as Repo),
            identity: identity.identity,
            execOptions: c.options,
            firstTime: false,
            treePath: c.root,
            filled: paths,
            review: {
              title: '项目里程碑与版本排期',
              body: '关键里程碑、特性交付安排与版本排期调整。具体特性 Issue 和版内范围由版本计划继续收敛。'
            }
          })
          if (outcome.mode === 'pr') {
            invalidateHostedReviewBranchCache(c.repo.path, getRepoExecutionHostId(c.repo as Repo))
          }
          return { outcome }
        })
      }
    )
  }

  return { read, working, save, discard, submit }
}
