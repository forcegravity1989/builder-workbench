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
      text: `名片未写完：${charter.error} —— 项目已接入，可稍后补`
    })
  } else {
    onLog({
      kind: 'ok',
      text: charter.adopted
        ? '仓里已有名片，只补了空字段'
        : '已写入 `.bw/project.toml`（MVP 落在工作区；完整 MR 约定后续接）'
    })
  }

  onLog({ kind: 'doing', text: '写入知识库地图草稿…' })
  try {
    const { draftKnowledgeMapFromPaths } = await import('./knowledge-doc-classify')
    const { writeKnowledgeMap } = await import('./knowledge-map')
    const markdowns = await window.api.fs.listMarkdownDocuments({ rootPath: repoPath })
    const draft = draftKnowledgeMapFromPaths([
      '.bw/project.toml',
      ...markdowns.map((m) => m.relativePath)
    ])
    const mapWrite = await writeKnowledgeMap(repoPath, draft, { overwrite: false })
    if (mapWrite.error) {
      onLog({ kind: 'fail', text: `知识库地图未写完：${mapWrite.error}` })
    } else if (mapWrite.existed && !mapWrite.wrote) {
      onLog({ kind: 'ok', text: '仓里已有知识库地图，未覆盖' })
    } else {
      onLog({
        kind: 'ok',
        text: '已写 `.bw/knowledge-map.toml` 草稿；可用 bw-knowledge-docs Skill 审阅'
      })
    }
  } catch (e) {
    onLog({
      kind: 'fail',
      text: `知识库地图跳过：${e instanceof Error ? e.message : String(e)}`
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

  onLog({ kind: 'ok', text: attached ? '完成，返回项目墙…' : '完成，正在打开项目墙…' })
  const switched = await switchActiveProject(repoId)
  if (switched) {
    const { openProjectWall } = await import('./project-wall-state')
    openProjectWall()
  }
  return { ok: switched, repoId, attached }
}
