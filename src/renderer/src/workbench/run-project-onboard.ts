import { useAppStore } from '@/store'
import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import { submitProjectCharter } from './charter-port'
import {
  CHARTER_BRANCH,
  normalizeCloneUrl,
  readProjectCharter,
  type ProjectCharter,
  writeProjectCharter
} from './project-charter'
import { switchActiveProject } from './switch-active-project'
import { ensureNamedWorktree, nativeWorkspaceScope } from './version-cycle/native-workspace'

export type OnboardLogLine = { text: string; kind: 'ok' | 'fail' | 'doing' }

export async function probeLocalCharter(path: string): Promise<{
  prefill: ProjectCharter
  note: string
}> {
  const result = await readProjectCharter(path)
  if (result.error) {
    return {
      prefill: { name: '', kind: '', brief: '', benchmark: '', opportunity: '' },
      note: `读名片失败：${result.error}`
    }
  }
  if (result.existed && result.charter) {
    return {
      prefill: result.charter,
      note: '仓里已有名片，空字段才会用你填的值覆盖。'
    }
  }
  const segments = path.split(/[\\/]/).filter((p) => p.length > 0)
  const base = segments.at(-1) ?? ''
  return {
    prefill: { name: base, kind: '', brief: '', benchmark: '', opportunity: '' },
    note: '仓里还没有名片，确认后会写入 `.bw/project.toml`。'
  }
}

/** Execute local-or-clone add + charter write + switch to overview. */
export async function submitProjectOnboard(args: {
  localRepo: boolean
  workspace: string
  remote: string
  cloneParent: string
  intent: ProjectCharter
  attachToGroupId?: string
  onLog: (line: OnboardLogLine) => void
}): Promise<{ ok: boolean; repoId: string; attached: boolean }> {
  const { localRepo, workspace, remote, cloneParent, intent, attachToGroupId, onLog } = args
  const addRepoPath = useAppStore.getState().addRepoPath
  const updateRepo = useAppStore.getState().updateRepo
  const fetchWorktrees = useAppStore.getState().fetchWorktrees
  const fetchRepos = useAppStore.getState().fetchRepos
  const moveProjectToGroup = useAppStore.getState().moveProjectToGroup

  let repoPath = ''
  let repoId = ''

  if (localRepo) {
    repoPath = workspace.trim()
    onLog({ kind: 'doing', text: `接入本地仓 ${repoPath}…` })
    try {
      await authorizeWorkbenchLocalPath(repoPath)
    } catch (e) {
      onLog({
        kind: 'fail',
        text: `无法授权读取该路径：${e instanceof Error ? e.message : String(e)}`
      })
      return { ok: false, repoId: '', attached: false }
    }
    const repo = await addRepoPath(repoPath, 'git', { displayName: intent.name })
    if (!repo) {
      onLog({
        kind: 'fail',
        text: '本地仓接入失败（看右上角 toast：路径无效、不是 Git 仓、或权限问题）'
      })
      return { ok: false, repoId: '', attached: false }
    }
    repoId = repo.id
    repoPath = repo.path
    onLog({ kind: 'ok', text: `已接入 ${repo.displayName}` })
  } else {
    const url = normalizeCloneUrl(remote)
    const parent = cloneParent.trim()
    if (!url || !parent) {
      onLog({ kind: 'fail', text: '远端地址或父文件夹为空' })
      return { ok: false, repoId: '', attached: false }
    }
    onLog({ kind: 'doing', text: `克隆 ${url} → ${parent}…` })
    const cloned = await window.api.repos.clone({ url, destination: parent })
    repoId = cloned.id
    repoPath = cloned.path
    await fetchRepos()
    const existing = useAppStore.getState().repos.find((r) => r.id === repoId)
    if (!existing) {
      await addRepoPath(repoPath, 'git', { displayName: intent.name })
    }
    onLog({ kind: 'ok', text: `克隆完成 ${repoPath}` })
  }

  if (repoId) {
    await updateRepo(repoId, { displayName: intent.name })
    // Why: BW fixed trees (bw/week-plan / bw/week-acceptance / bw/project) follow Orca's
    // per-repo worktree base; without one they land under the global workspaceDir, often on
    // another drive than the project. Set the project-local convention once, visibly.
    const registered = useAppStore.getState().repos.find((r) => r.id === repoId)
    if (registered && !registered.worktreeBasePath?.trim()) {
      await updateRepo(repoId, { worktreeBasePath: '.bw/worktrees' })
      onLog({
        kind: 'ok',
        text: '已设单仓工作树基址 `.bw/worktrees`（工作树落在项目目录内）；可在 设置 > Repository worktree defaults 修改或清空'
      })
    }
    await fetchWorktrees(repoId)
  }

  await runCharterFlow({ repoId, repoPath, intent, onLog })

  let attached = false
  if (repoId && attachToGroupId) {
    onLog({ kind: 'doing', text: '挂到当前项目组…' })
    const order = useAppStore
      .getState()
      .repos.filter((r) => r.projectGroupId === attachToGroupId).length
    const moved = await moveProjectToGroup(repoId, attachToGroupId, order)
    if (!moved) {
      onLog({ kind: 'fail', text: '代码仓已接入，但挂入项目组失败' })
    } else {
      attached = true
      onLog({ kind: 'ok', text: '已挂入项目的代码槽' })
    }
  }

  onLog({ kind: 'ok', text: '完成，正在进入总览…' })
  const switched = await switchActiveProject(repoId)
  return { ok: switched, repoId, attached }
}

const CHARTER_STAGE_TEXT = {
  read: '名片文件读不了',
  validate: '信息不完整',
  commit: '提交没成',
  push: '推分支没成',
  pr: 'PR 没开成'
} as const

/** 无远端/开不出固定树时的就地兜底:写主检出并如实说明局限。 */
async function writeCharterLocally(
  repoPath: string,
  intent: ProjectCharter,
  note: string,
  onLog: (line: OnboardLogLine) => void
): Promise<void> {
  const charter = await writeProjectCharter(repoPath, intent)
  if (charter.error) {
    onLog({
      kind: 'fail',
      text: `名片未写入：${charter.error} —— 项目已接入，可稍后在墙卡「编辑名片」补`
    })
  } else if (charter.adopted) {
    onLog({
      kind: 'ok',
      text:
        charter.filled.length > 0
          ? `${note}；仓里已有名片，只补了 ${charter.filled.length} 个空字段，其余内容未动`
          : `${note}；仓里已有名片，没有可补的空字段，未改动`
    })
  } else {
    onLog({ kind: 'ok', text: `${note}；已在工作区写入 \`.bw/project.toml\`` })
  }
}

/**
 * 名片落仓:有远端走 bw/project 固定树提交 + PR(spec 规则 2);
 * 无远端、空仓或固定树开不出时就地写并如实说明(main push_and_open_mr 降级语义)。
 */
async function runCharterFlow(args: {
  repoId: string
  repoPath: string
  intent: ProjectCharter
  onLog: (line: OnboardLogLine) => void
}): Promise<void> {
  const { repoId, repoPath, intent, onLog } = args
  onLog({ kind: 'doing', text: '写入 / 合并 `.bw/project.toml`…' })
  const worktrees = repoId ? (useAppStore.getState().worktreesByRepo[repoId] ?? []) : []
  const mainTree = worktrees.find((w) => w.isMainWorktree) ?? worktrees[0]
  if (repoId && mainTree) {
    try {
      const scope = nativeWorkspaceScope(mainTree)
      const projectTree = await ensureNamedWorktree(scope, CHARTER_BRANCH, 'project')
      const outcome = await submitProjectCharter(
        { ...scope, worktreeId: projectTree.id },
        scope.runtimeOwnerEnvironmentId,
        intent,
        true
      )
      await applyCharterOutcome({ outcome, repoPath, intent, onLog })
      return
    } catch (e) {
      onLog({
        kind: 'fail',
        text: `名片固定树没开成：${e instanceof Error ? e.message : String(e)}`
      })
    }
  }
  await writeCharterLocally(
    repoPath,
    intent,
    repoId && !mainTree
      ? '仓里还没有可用工作树（可能没有第一条提交），名片就地写'
      : '退回工作区就地写',
    onLog
  )
}

/** submit 结果 → 用户日志;local-only 由调用方语境就地兜底。接入与编辑名片共用。 */
export async function applyCharterOutcome(args: {
  outcome: Awaited<ReturnType<typeof submitProjectCharter>>
  repoPath: string
  intent: ProjectCharter
  onLog: (line: OnboardLogLine) => void
}): Promise<void> {
  const { outcome, repoPath, intent, onLog } = args
  switch (outcome.mode) {
    case 'pr': {
      const label = outcome.pr.provider === 'github' ? 'PR' : 'MR'
      onLog({
        kind: 'ok',
        text: `名片 ${label} ${outcome.pr.adopted ? '复用已开的' : '已开'}：#${outcome.pr.number}${outcome.pr.url ? `（${outcome.pr.url}）` : ''} —— 平台侧合入前墙卡显示「待合入」，合入后点「更新主目录」落回主检出`
      })
      break
    }
    case 'noop':
      onLog({ kind: 'ok', text: '仓里已有合入的名片，没有可补的空字段，未改动' })
      break
    case 'local-only':
      await writeCharterLocally(repoPath, intent, outcome.reason, onLog)
      break
    case 'failed':
      onLog({
        kind: 'fail',
        text: `名片没写成（${CHARTER_STAGE_TEXT[outcome.stage]}）：${outcome.error} —— 可稍后在墙卡「编辑名片」补`
      })
      break
  }
}
