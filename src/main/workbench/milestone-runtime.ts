import type { Repo } from '../../shared/repo-types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import { CHARTER_BRANCH } from '../../shared/workbench/project-charter'
import {
  MILESTONES_PATH,
  milestoneDraft,
  milestoneProblems,
  type MilestoneRead,
  type MilestoneSubmit,
  type MilestoneSubmitResult
} from '../../shared/workbench/project-milestones'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../shared/workbench/version-planning-material'
import { gitExecFileAsync } from '../git/runner'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceScope
} from './workspace-resolver'
import type { CharterRuntimeHost } from './charter-runtime'
import type { VersionWorkspacePrepareRuntime } from './version-workspace-prepare'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import { runTrunkBaseline } from './trunk-baseline'
import { serializeCharterSubmission } from './charter-submit-queue'
import { readMilestoneSources, isMilestoneAncestor } from './milestone-read'
import { createCharterReview } from './charter-create-review'
import { readMilestoneSnapshot } from './milestone-snapshot'
import { writeMilestoneFiles } from './milestone-write-files'

type Runtime = CharterRuntimeHost & Pick<VersionWorkspacePrepareRuntime, 'listManagedWorktrees'>
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function nativeMilestoneService(runtime: Runtime) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  async function context(scope: WorkbenchWorkspaceScope) {
    const resolved = await resolver.resolve(scope)
    if (parseExecutionHostId(resolved.target.hostId)?.kind === 'ssh') {
      throw new Error('此宿主的项目材料编辑尚未接入，请在所属运行环境打开项目；未改动文件')
    }
    const options = resolveWorkbenchGitExecOptions(runtime, resolved.repo)
    const trees = (await runtime.listManagedWorktrees(`id:${resolved.repo.id}`)).worktrees
    const started = new Set(
      trees.flatMap((t) => (t.workbenchVersionBinding ? [t.workbenchVersionBinding.version] : []))
    )
    const baseline = await runTrunkBaseline(
      resolved.repo.path,
      resolved.repo.worktreeBaseRef ?? null,
      options
    )
    const git = async (args: string[]) =>
      (
        await gitExecFileAsync(args, {
          ...options,
          cwd: resolved.target.worktreePath,
          timeout: 90_000
        })
      ).stdout.trim()
    const ref = await git([
      'for-each-ref',
      '--format=%(objectname)',
      `refs/heads/${CHARTER_BRANCH}`
    ])
    return { ...resolved, options, started, baseline, git, branchHead: ref || null }
  }
  async function read(scope: WorkbenchWorkspaceScope): Promise<MilestoneRead> {
    return readMilestoneSources(await context(scope))
  }
  async function submit(input: MilestoneSubmit): Promise<MilestoneSubmitResult> {
    return serializeCharterSubmission(
      JSON.stringify([input.scope.hostId, input.scope.repoId]),
      async () => {
        const c = await context(input.scope)
        const { git } = c
        if (
          c.target.isMainWorktree ||
          (await git(['branch', '--show-current'])) !== CHARTER_BRANCH
        ) {
          throw new Error('请在原生登记的项目材料工作树提交')
        }
        if (await git(['status', '--porcelain'])) {
          throw new Error('项目材料工作树有未提交修改，请先核对；本次草案保留')
        }
        if (c.branchHead !== input.expectedProposal && input.expectedProposal !== null) {
          throw new Error('项目材料已被另一处更新，请刷新后核对；草案保留')
        }
        const formal = await readMilestoneSnapshot(
          c.repo.path,
          c.baseline.commit,
          c.options,
          c.started
        )
        if (formal.snapshot.revision !== input.expectedFormal) {
          throw new Error('正式规划或版本计划已更新，请刷新后核对；草案保留')
        }
        const head = await git(['rev-parse', 'HEAD'])
        let source = await readMilestoneSnapshot(c.repo.path, head, c.options, c.started)
        if (!(await isMilestoneAncestor(git, c.baseline.commit, head))) {
          if (!(await isMilestoneAncestor(git, head, c.baseline.commit))) {
            throw new Error('项目材料分支与主干已分叉，请通过原生会话合并后重试；没有重置分支')
          }
          await git(['merge', '--ff-only', c.baseline.commit])
          source = await readMilestoneSnapshot(
            c.repo.path,
            await git(['rev-parse', 'HEAD']),
            c.options,
            c.started
          )
        }
        if (
          input.expectedProposal === null &&
          json(milestoneDraft(source.snapshot)) !== json(milestoneDraft(formal.snapshot))
        ) {
          throw new Error('发现已有项目材料草案，请刷新后核对；本次输入保留')
        }
        const problems = milestoneProblems(input)
        if (problems.length) {
          throw new Error(problems.join('；'))
        }
        if (source.snapshot.problems.length) {
          throw new Error('存在无法读取的版本材料，请先处理再提交')
        }
        const writes = new Map<string, string>()
        const removals: string[] = []
        for (const old of source.snapshot.versions) {
          if (!input.versions.some((v) => v.cycleId === old.cycleId)) {
            throw new Error('此入口不能删除已有项目版本')
          }
        }
        for (const next of input.versions) {
          const old = source.plans.get(next.cycleId)
          if (!old && c.started.has(next.version)) {
            throw new Error(
              `${next.version} 已在版本计划开工，请先核对并合入该版本材料，不能重复登记`
            )
          }
          const prior = source.snapshot.versions.find((v) => v.cycleId === next.cycleId)
          if (old && old.version !== next.version) {
            if (old.version.toLowerCase() === next.version.toLowerCase()) {
              throw new Error('版本改名不能仅改变大小写，请保留实际版本名称')
            }
            const materialFiles = await git([
              'ls-tree',
              '-r',
              '--name-only',
              source.snapshot.head,
              '--',
              `.bw/planning/${old.version}/`
            ])
            if (prior?.started || materialFiles.split('\n').filter(Boolean).length !== 1) {
              throw new Error(
                `${old.version} 已开始制定计划或有其他材料，请按真实版本核对里程碑，不能在此改名`
              )
            }
          }
          const collision = source.snapshot.versions.find(
            (v) =>
              v.version.toLowerCase() === next.version.toLowerCase() && v.cycleId !== next.cycleId
          )
          if (collision) {
            throw new Error(`版本 ${next.version} 已存在`)
          }
          const document: PlanningMaterial = old
            ? { ...old, version: next.version }
            : {
                schema_version: 3,
                version: next.version,
                cycleId: next.cycleId,
                summary: { progress: '', risks: '' },
                goals: [],
                tasks: []
              }
          if (next.timeWindow) {
            document.timeWindow = next.timeWindow
          } else {
            delete document.timeWindow
          }
          PlanningMaterialSchema.parse(document)
          if (old && json(old) === json(document)) {
            continue
          }
          const path = `.bw/planning/${next.version}/data.json`
          writes.set(path, json(document))
          if (old && old.version !== next.version) {
            removals.push(`.bw/planning/${old.version}/data.json`)
          }
        }
        if (
          json(input.material) !== json(source.snapshot.material) ||
          !source.contents.has(MILESTONES_PATH)
        ) {
          writes.set(MILESTONES_PATH, json(input.material))
        }
        const identity = await probeGitRemoteIdentity(
          c.repo.path,
          getRepoExecutionHostId(c.repo as Repo)
        )
        if (identity.status !== 'resolved') {
          throw new Error('未确认远端身份，草案保留，恢复连接后重试')
        }
        const paths = [...writes.keys(), ...removals]
        await writeMilestoneFiles({
          root: c.target.worktreePath,
          writes,
          removals,
          contents: source.contents,
          recheck: async () => {
            await c.reauthorize()
            const active = (
              await runtime.listManagedWorktrees(`id:${c.repo.id}`)
            ).worktrees.flatMap((t) =>
              t.workbenchVersionBinding ? [t.workbenchVersionBinding.version] : []
            )
            for (const next of input.versions) {
              const old = source.plans.get(next.cycleId)
              if (
                (!old || old.version !== next.version) &&
                active.some((v) => v === next.version || v === old?.version)
              ) {
                throw new Error('版本刚开始计划，请重新核对身份；没有写入文件')
              }
            }
            const baseline = await runTrunkBaseline(
              c.repo.path,
              c.repo.worktreeBaseRef ?? null,
              c.options
            )
            if (
              baseline.commit !== c.baseline.commit ||
              (await git(['rev-parse', 'HEAD'])) !== source.snapshot.head ||
              (await git(['branch', '--show-current'])) !== CHARTER_BRANCH
            ) {
              throw new Error('规划修订已变化，草案保留，请重新核对')
            }
            if (await git(['status', '--porcelain', '--untracked-files=no'])) {
              throw new Error('工作副本已变化，请核对后重试')
            }
          },
          commit: async () => {
            if (
              (await git(['rev-parse', 'HEAD'])) !== source.snapshot.head ||
              (await git(['branch', '--show-current'])) !== CHARTER_BRANCH
            ) {
              throw new Error('提交前分支修订已变化，文件保留待核对')
            }
            if (paths.length) {
              await git(['add', '--', ...paths])
              await git(['commit', '--only', '-m', '更新项目里程碑与版本排期', '--', ...paths])
            }
          }
        })
        const proposal = (
          await readMilestoneSnapshot(
            c.repo.path,
            await git(['rev-parse', 'HEAD']),
            c.options,
            c.started
          )
        ).snapshot
        try {
          await git(['push', '-u', 'origin', CHARTER_BRANCH])
        } catch (error) {
          return {
            proposal,
            outcome: {
              mode: 'failed' as const,
              stage: 'push' as const,
              error: `已提交，推送未成功：${message(error)}`,
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
          treePath: c.target.worktreePath,
          filled: paths,
          review: {
            title: '项目里程碑与版本排期',
            body: '月度成果、特性 SDLC 阶段安排与版本排期调整。具体特性 Issue 和版内范围由版本计划继续收敛；合入不代表交付或验收完成。'
          }
        })
        return { proposal, outcome }
      }
    )
  }
  return { read, submit }
}
