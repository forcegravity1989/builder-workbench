/**
 * 「克隆到本机」的编排：把墙上只注册在 Builder 主机的代码仓，按已有远端地址克隆到本机，
 * 并登记成本机项目的一部分。
 *
 * 复用既有生产能力，不另造平行实现：
 * - `repos:clone` IPC 与主进程的落点校验/占用（同「接入项目」向导的克隆分支）。
 * - 落点默认值由交互层用 `getDefaultCloneParent(settings.workspaceDir)` 算好传入。
 * - 克隆后的登记动作与 `run-project-onboard` 一致：本机注册 → 展示名 → 单仓工作树基址
 *   → 刷新工作树 → 挂入项目组；全部成功才切到项目总览（`finishCloneToLocal`）。
 *
 * 同远端去重：墙上同一远端身份只一槽（`buildWallProjects` 按身份键归并），
 * 所以本模块只克隆调用方明确选中的槽；调用方已用 `cloneableSlots` 排除了本机已注册的槽。
 */
import { useAppStore } from '@/store'
import { upsertAddedRepoWithProjectHostSetup } from '@/components/sidebar/add-repo-store-upsert'
import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import { cloneDisplayName, type CloneTarget } from './clone-to-local-plan'
import { switchActiveProject } from './switch-active-project'
import { ensureWallProjectGroup } from './wall-project-repo-actions'
import type { WallProject } from './workbench-wall-projects'

/** 单仓克隆结果；失败逐仓如实报原因，不冒充整体成功。 */
export type CloneRepoOutcome = {
  /** 失败时为该槽在墙上的 repoId（本机注册行还不存在）；成功时为本机注册行 id。 */
  repoId: string
  name: string
  ok: boolean
  reason?: string
}

export type CloneToLocalResult = {
  outcomes: CloneRepoOutcome[]
  /** 克隆成功并挂入项目组的本机注册行 id。 */
  clonedRepoIds: string[]
  /** 选中仓全部成功（至少一个）；此时才自动切到项目总览。 */
  allSucceeded: boolean
  /** 整体性失败原因（父目录缺失、项目组建不出来）；为空表示没发生。 */
  error: string | null
}

/** 单仓克隆阶段，供交互层逐条显示进度。 */
export type CloneStepPhase = 'cloning' | 'registering' | 'done' | 'failed'

/**
 * 把选中的槽逐个克隆到本机并登记进项目。
 *
 * 逐仓顺序执行：单仓失败不中断其余（同「导入 Builder 主机」的批量壳），失败原因逐仓回传。
 * 整体失败（父目录不可用、项目组建不出来）时不做任何克隆。
 */
export async function cloneProjectReposToLocal(args: {
  project: WallProject
  targets: readonly CloneTarget[]
  onStep: (repoId: string, phase: CloneStepPhase, detail?: string) => void
}): Promise<CloneToLocalResult> {
  const { project, targets, onStep } = args
  if (targets.length === 0) {
    return { outcomes: [], clonedRepoIds: [], allSucceeded: false, error: null }
  }
  const parent = targets[0].parent.trim()
  if (!parent) {
    return { outcomes: [], clonedRepoIds: [], allSucceeded: false, error: '还没选克隆到哪个父目录' }
  }

  // Why: 项目组要先建好；没有组，克隆回来的仓各成一张卡，项目就散了。
  const groupId = await ensureWallProjectGroup(project)
  if (!groupId) {
    return {
      outcomes: [],
      clonedRepoIds: [],
      allSucceeded: false,
      error: '无法为该项目建立项目组，没有开始克隆'
    }
  }

  try {
    await authorizeWorkbenchLocalPath(parent)
  } catch (e) {
    return {
      outcomes: [],
      clonedRepoIds: [],
      allSucceeded: false,
      error: `无法访问父目录：${e instanceof Error ? e.message : String(e)}`
    }
  }
  // Why: 用户手输的父目录可能还不存在。克隆会建末级目录，父目录先兜一层；
  // 建不出来不致命，交给 repos:clone 用它自己的错误说明真实原因。
  try {
    if (!(await window.api.fs.pathExists({ filePath: parent }))) {
      await window.api.fs.createDir({ dirPath: parent })
    }
  } catch {
    /* 交给克隆报真实错误 */
  }

  const outcomes: CloneRepoOutcome[] = []
  const clonedRepoIds: string[] = []

  for (const target of targets) {
    const slotRepoId = target.slot.repoId
    const name = cloneDisplayName(target.slot)
    onStep(slotRepoId, 'cloning', target.targetPath)
    try {
      const cloned = await window.api.repos.clone({ url: target.url, destination: parent })
      // Why: 克隆只在本机落盘；登记时显式钉本机执行主机，避免被当成远端行。
      const { repo } = upsertAddedRepoWithProjectHostSetup(cloned, { runtimeEnvironmentId: null })
      onStep(slotRepoId, 'registering')
      await useAppStore.getState().updateRepo(repo.id, { displayName: name })
      // Why: BW 固定树（bw/week-plan / bw/week-acceptance / bw/project）跟随单仓工作树基址；
      // 没设就会落到全局 workspaceDir，常与项目不同盘。没设过才补，不覆盖用户已选的值。
      if (!useAppStore.getState().repos.find((r) => r.id === repo.id)?.worktreeBasePath?.trim()) {
        await useAppStore.getState().updateRepo(repo.id, { worktreeBasePath: '.bw/worktrees' })
      }
      await useAppStore.getState().fetchWorktrees(repo.id)

      const store = useAppStore.getState()
      const order = store.repos.filter((r) => r.projectGroupId === groupId).length
      const moved = await store.moveProjectToGroup(repo.id, groupId, order)
      if (!moved) {
        onStep(slotRepoId, 'failed', '已克隆到本机，但挂入项目组失败')
        outcomes.push({ repoId: repo.id, name, ok: false, reason: '挂入项目组失败' })
        continue
      }
      clonedRepoIds.push(repo.id)
      outcomes.push({ repoId: repo.id, name, ok: true })
      onStep(slotRepoId, 'done', repo.path)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      onStep(slotRepoId, 'failed', reason)
      outcomes.push({ repoId: slotRepoId, name, ok: false, reason })
    }
  }

  if (clonedRepoIds.length > 0) {
    await useAppStore.getState().fetchRepos()
  }

  return {
    outcomes,
    clonedRepoIds,
    allSucceeded: outcomes.length > 0 && outcomes.every((outcome) => outcome.ok),
    error: null
  }
}

/**
 * 切到第一个克隆成功的项目总览（本机注册行成了该项目的主注册）。
 *
 * 调用方决定时机：全部成功时自动切（与「接入项目」向导一致）；有失败时不自动切，
 * 留在墙上让逐仓原因可见，改由人点按切换。
 */
export async function switchToClonedProject(result: CloneToLocalResult): Promise<boolean> {
  const first = result.clonedRepoIds[0]
  if (!first) {
    return false
  }
  return switchActiveProject(first)
}
