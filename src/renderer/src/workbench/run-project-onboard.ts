import { useAppStore } from '@/store'
import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import {
  normalizeCloneUrl,
  readProjectCharter,
  type ProjectCharter,
  writeProjectCharter
} from './project-charter'
import { switchActiveProject } from './switch-active-project'

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

  onLog({ kind: 'doing', text: '写入 / 合并 `.bw/project.toml`…' })
  const charter = await writeProjectCharter(repoPath, intent)
  if (charter.error) {
    onLog({
      kind: 'fail',
      text: `名片未写入：${charter.error} —— 项目已接入，可稍后补`
    })
  } else if (charter.adopted) {
    onLog({
      kind: 'ok',
      text:
        charter.filled.length > 0
          ? `仓里已有名片，只补了 ${charter.filled.length} 个空字段，其余内容未动`
          : '仓里已有名片，没有可补的空字段，未改动'
    })
  } else {
    onLog({
      kind: 'ok',
      text: '已写入 `.bw/project.toml`（落在工作区；经 PR 落仓正在接）'
    })
  }

  if (repoId) {
    await updateRepo(repoId, { displayName: intent.name })
    // Why: BW fixed trees (bw/week-plan / bw/week-acceptance) follow Orca's per-repo
    // worktree base; without one they land under the global workspaceDir, often on
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
