import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { closeProjectPage, openCharterEdit, openProjectOnboard } from './project-page-state'
import { switchActiveProject } from './switch-active-project'
import {
  buildWallProjects,
  countWallProjectWorktrees,
  type WallProject
} from './workbench-wall-projects'
import { buildWallHostFact } from './wall-host-facts'
import { useWallAdoptions } from './use-wall-adoptions'
import { ensureWallProjectGroup, removeRepoFromWallProject } from './wall-project-repo-actions'
import { ImportBuilderHostsDialog } from './ImportBuilderHostsDialog'
import { ProjectWallCard, type CardHostTag, type WallCardView } from './ProjectWallCard'
import { useWallReadings } from './use-wall-readings'
import type { WallCardReadings } from './wall-card-readings'
import './workbench-wall.css'

const READINGS_LOADING: WallCardReadings = {
  version: { kind: 'loading' },
  progress: { kind: 'loading' },
  sessions: { kind: 'unknown' },
  prs: { kind: 'loading' }
}

async function startAddRepoSlot(project: WallProject): Promise<void> {
  const groupId = await ensureWallProjectGroup(project)
  if (!groupId) {
    return
  }
  openProjectOnboard({
    attachToGroupId: groupId,
    seedName: project.name,
    attachLabel: project.name
  })
}

function formatRefreshTime(timestamp: number | null): string {
  if (timestamp === null) {
    return '读取中…'
  }
  if (Date.now() - timestamp < 60_000) {
    return '刚刚'
  }
  const at = new Date(timestamp)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

export function ProjectWallPage(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const fetchReposForAllHosts = useAppStore((s) => s.fetchReposForAllHosts)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)

  const [adoptionToken, setAdoptionToken] = useState(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [updatingRepoId, setUpdatingRepoId] = useState<string | null>(null)
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [busyRepoId, setBusyRepoId] = useState<string | null>(null)

  // 墙的主机目录 = 当前配对集合:已删主机的残留注册行不上墙(可重算,铁律一)。
  const hostCatalog = useMemo(
    () => ({ environmentIds: new Set(runtimeEnvironments.map((env) => env.id)) }),
    [runtimeEnvironments]
  )
  const wallProjects = useMemo(
    () => buildWallProjects(repos, projectGroups, hostCatalog),
    [repos, projectGroups, hostCatalog]
  )
  // 上墙判据:能读到 .bw/project.toml(或本机有名片 PR 证据)的项目才上墙。
  const { adoptionByKey, loadCount } = useWallAdoptions(wallProjects, adoptionToken)
  // 墙卡读数:只给已上墙的项目读(gh/RPC 调用不便宜),与名片同一刷新 token。
  const adoptedProjects = useMemo(
    () => wallProjects.filter((project) => adoptionByKey[project.key]?.adopted),
    [wallProjects, adoptionByKey]
  )
  const readingsByKey = useWallReadings(adoptedProjects, adoptionToken)

  useEffect(() => {
    if (loadCount > 0) {
      setLastRefreshedAt(Date.now())
    }
  }, [loadCount])

  const refreshWall = useCallback(async () => {
    setRefreshing(true)
    try {
      // 刷新 = 重读本机与已配对主机的仓库目录、工作树与名片数据,作用整面墙。
      // 成本清单(H 配对主机/R 仓行/P 上墙项目/S 仓槽):H×4 RPC + R×1 工作树 RPC +
      // 每项目名片逐行读到即止(全读不到的本机行再 1 次 PR 状态 RPC)+ 每项目 4 个
      // 材料 RPC + 每 GitHub 任务仓 1 次 gh GraphQL 批量 + 每 CodeHub 任务 1–2 次
      // codehub-cli viewTask(先 Issue 后 MR,MR 型最坏 2 次)+ 每槽 PR 计数逐页;
      // 会话计数 0 外部调用(store 现算)。查询键不变不重发是防风暴闸。
      await fetchReposForAllHosts()
      await fetchAllWorktrees()
      setAdoptionToken((n) => n + 1)
    } finally {
      setRefreshing(false)
    }
  }, [fetchReposForAllHosts, fetchAllWorktrees])

  const cards = useMemo((): WallCardView[] => {
    const views: WallCardView[] = []
    for (const project of wallProjects) {
      const adoption = adoptionByKey[project.key]
      if (!adoption?.adopted) {
        continue
      }
      const hostTags: CardHostTag[] = project.hostIds.map((hostId) => {
        const fact = buildWallHostFact(
          hostId,
          runtimeEnvironments,
          runtimeStatusByEnvironmentId,
          sshTargetLabels
        )
        const hostRows = project.rows.filter((row) => getRepoExecutionHostId(row) === hostId)
        return {
          hostId,
          label: fact.label,
          online: fact.online,
          isLocal: hostId === LOCAL_EXECUTION_HOST_ID,
          worktreeCount: countWallProjectWorktrees(hostRows, worktreesByRepo)
        }
      })
      views.push({
        project,
        displayName: adoption.charter?.name?.trim() || project.name,
        brief: adoption.charter?.brief?.trim() || '',
        readings: readingsByKey[project.key] ?? READINGS_LOADING,
        isActive: project.repoIds.includes(activeRepoId ?? ''),
        charter: adoption.charter,
        status: adoption.status,
        worktreeCount: countWallProjectWorktrees(project.rows, worktreesByRepo),
        hostTags,
        remoteWorktreeCount: hostTags
          .filter((tag) => !tag.isLocal)
          .reduce((total, tag) => total + tag.worktreeCount, 0),
        primaryRepo: repos.find((row) => row.id === project.primaryRepoId)
      })
    }
    return views
  }, [
    wallProjects,
    adoptionByKey,
    readingsByKey,
    activeRepoId,
    repos,
    worktreesByRepo,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    sshTargetLabels
  ])

  const totalWorktrees = useMemo(
    () => cards.reduce((total, card) => total + card.worktreeCount, 0),
    [cards]
  )
  // 主机连接事实(runtime 实时推导;未知不装在线,铁律二)。
  const hostConnections = useMemo(() => {
    const entries: { label: string; online: boolean | null }[] = [{ label: '本机', online: null }]
    for (const env of runtimeEnvironments) {
      const status = runtimeStatusByEnvironmentId.get(env.id)
      entries.push({
        label: env.name,
        online: status === undefined ? null : status.status !== null
      })
    }
    return entries.map((entry) =>
      entry.online === null ? entry.label : `${entry.label} ${entry.online ? '在线' : '离线'}`
    )
  }, [runtimeEnvironments, runtimeStatusByEnvironmentId])

  const updateMainCheckout = async (repo: {
    id: string
    path: string
    connectionId?: string | null
  }): Promise<void> => {
    setUpdatingRepoId(repo.id)
    try {
      await window.api.git.fastForward({
        worktreePath: repo.path,
        ...(repo.connectionId ? { connectionId: repo.connectionId } : {})
      })
      toast.success('主检出已拉到最新')
      setAdoptionToken((n) => n + 1)
    } catch (e) {
      toast.error(`没拉动：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUpdatingRepoId(null)
    }
  }

  return (
    <div className="wb-wall-page" aria-label="项目墙" data-screen="wall">
      <div className="wb-wall">
        <header className="page-head">
          <h1>项目墙</h1>
          <div className="page-actions">
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              disabled={refreshing}
              title="重新读取本机与已配对 Builder 主机的仓库目录、名片数据与四项读数，刷新整面项目墙"
              data-workbench-refresh
              onClick={() => {
                void refreshWall()
              }}
            >
              {refreshing ? '刷新中…' : '刷新'}
            </button>
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              title="批量导入共享的 Orca 主机配对配置；只添加 Builder 主机，不克隆项目"
              data-workbench-import-hosts
              onClick={() => setImportOpen(true)}
            >
              导入 Builder 主机
            </button>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              data-workbench-onboard
              onClick={() => {
                openProjectOnboard()
              }}
            >
              + 接入项目
            </button>
            <button type="button" className="wb-btn wb-btn-ghost" onClick={closeProjectPage}>
              关闭
            </button>
          </div>
        </header>

        <div className="wallbar" aria-label="项目墙概况">
          <span className="wallbar-item">
            共 <strong>{cards.length}</strong> 个项目 · <strong>{totalWorktrees}</strong> 个工作树
          </span>
          <span className="wallbar-sep" aria-hidden />
          <span
            className="wallbar-item"
            title="连接状态由 Orca runtime 实时推导，是连接事实，用于导入反馈与离线如实提示；不冒充项目健康"
            data-workbench-host-connections
          >
            主机连接：{hostConnections.join(' · ')}
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="wallbar-item" data-workbench-refresh-time>
            上次刷新：{formatRefreshTime(lastRefreshedAt)}
          </span>
        </div>

        {cards.length === 0 ? (
          <div className="wb-card empty-center">
            {loadCount === 0 ? (
              '正在读取项目名片…'
            ) : wallProjects.length === 0 ? (
              <>
                还没有接入任何项目。
                <br />
                点击「接入项目」打开本地仓库或克隆远端仓库。
              </>
            ) : (
              <>
                还没有能读到 <code>.bw/project.toml</code> 的项目。
                <br />
                未纳入的项目留在左侧 Orca Projects；接入项目或导入 Builder 主机后刷新。
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                onClick={() => {
                  openProjectOnboard()
                }}
              >
                + 接入项目
              </button>
            </div>
          </div>
        ) : (
          <div className="wall-grid">
            {cards.map((card) => (
              <ProjectWallCard
                key={card.project.key}
                card={card}
                switching={switchingKey === card.project.key}
                busyRepoId={busyRepoId}
                updatingMain={updatingRepoId === card.project.primaryRepoId}
                onOpen={() => {
                  setSwitchingKey(card.project.key)
                  void switchActiveProject(card.project.primaryRepoId).finally(() =>
                    setSwitchingKey(null)
                  )
                }}
                onRemoveRepo={(repoId) => {
                  setBusyRepoId(repoId)
                  void removeRepoFromWallProject({ project: card.project, repoId }).finally(() =>
                    setBusyRepoId(null)
                  )
                }}
                onEditCharter={() =>
                  openCharterEdit({
                    repoId: card.project.primaryRepoId,
                    seedName: card.displayName
                  })
                }
                onAddRepo={() => {
                  void startAddRepoSlot(card.project)
                }}
                onUpdateMain={() => {
                  if (card.primaryRepo) {
                    void updateMainCheckout(card.primaryRepo)
                  }
                }}
              />
            ))}
          </div>
        )}

        <ImportBuilderHostsDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={refreshWall}
        />
      </div>
    </div>
  )
}
