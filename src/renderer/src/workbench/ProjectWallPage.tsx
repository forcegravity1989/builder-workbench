import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileInput, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSettingsRail } from './ProjectSettingsRail'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { closeProjectPage, openProjectOnboard } from './project-page-state'
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
import './project-settings.css'

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

export function ProjectWallPage({
  configureRepoId
}: { configureRepoId?: string } = {}): React.JSX.Element {
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
  const [refreshing, setRefreshing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [busyRepoId, setBusyRepoId] = useState<string | null>(null)
  const [configurationKey, setConfigurationKey] = useState<string | null | undefined>(undefined)
  const [draftDirty, setDraftDirty] = useState(false)
  const [configurationBusy, setConfigurationBusy] = useState(false)
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 680px)').matches)
  const configurationTrigger = useRef<HTMLButtonElement | null>(null)
  const discardCurrent = useRef<(() => void) | null>(null)
  const leave = (action: () => void) => {
    if (configurationBusy) {
      return
    }
    if (draftDirty) {
      setLeaveAction(() => action)
    } else {
      action()
    }
  }
  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)')
    const changed = () => setNarrow(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])

  // 墙的主机目录 = 当前配对集合:已删主机的残留注册行不上墙(可重算,铁律一)。
  const hostCatalog = useMemo(
    () => ({ environmentIds: new Set(runtimeEnvironments.map((env) => env.id)) }),
    [runtimeEnvironments]
  )
  const wallProjects = useMemo(
    () =>
      buildWallProjects(
        repos.filter((repo) => !repo.runtimeSessionPlaceholder),
        projectGroups,
        hostCatalog
      ),
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

  const refreshWall = useCallback(async () => {
    setRefreshing(true)
    try {
      // 刷新 = 重读本机与已配对主机的仓库目录、工作树与名片数据,作用整面墙。
      // 成本清单(H 配对主机/R 仓行/P 上墙项目/S 仓槽):H×4 RPC + R×1 工作树 RPC +
      // 每项目名片逐行读到即止(全读不到的本机行再 1 次 PR 状态 RPC)+ 每项目 4 个
      // 材料 RPC + 每 GitHub 任务仓 1 次 gh GraphQL 批量 + 每 CodeHub 任务 1 次
      // codehub-cli viewTask(只读 Issue)+ 每槽 PR 计数逐页;
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
        primaryRepo: project.rows.find((row) => row.id === project.primaryRepoId)
      })
    }
    return views
  }, [
    wallProjects,
    adoptionByKey,
    readingsByKey,
    activeRepoId,
    worktreesByRepo,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    sshTargetLabels
  ])

  const selectedCard = cards.find(
    (card) =>
      card.project.key === configurationKey ||
      (configurationKey === undefined &&
        configureRepoId &&
        card.project.repoIds.includes(configureRepoId))
  )
  const closeConfiguration = () =>
    leave(() => {
      setConfigurationKey(null)
      setDraftDirty(false)
      setConfigurationBusy(false)
      configurationTrigger.current?.focus()
    })

  return (
    <TooltipProvider>
      <div className="wb-wall-page" aria-label="项目墙" data-screen="wall">
        <div className="wb-wall" inert={narrow && Boolean(selectedCard)}>
          <header className="page-head">
            <h1>项目墙</h1>
            <div className="page-actions" role="group" aria-label="项目墙操作">
              <WorkbenchIconButton
                label="刷新项目墙"
                icon={refreshing ? LoaderCircle : RefreshCw}
                className={refreshing ? 'wb-icon-spin' : ''}
                disabled={refreshing}
                data-workbench-refresh
                onClick={() => void refreshWall()}
              />
              <WorkbenchIconButton
                label="导入 Builder 主机"
                icon={FileInput}
                data-workbench-import-hosts
                onClick={() => setImportOpen(true)}
              />
              <WorkbenchIconButton
                label="接入项目"
                icon={Plus}
                data-workbench-onboard
                onClick={() => leave(() => openProjectOnboard())}
              />
              <WorkbenchIconButton
                label="关闭项目墙"
                icon={X}
                onClick={() => leave(closeProjectPage)}
              />
            </div>
          </header>
          <div className="wallbar" aria-label="项目墙概况">
            <span>共 {cards.length} 个项目</span>
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
                    leave(() => openProjectOnboard())
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
                  configured={selectedCard?.project.key === card.project.key}
                  switching={switchingKey === card.project.key}
                  onOpen={() =>
                    leave(() => {
                      setSwitchingKey(card.project.key)
                      void switchActiveProject(card.project.primaryRepoId)
                        .catch((error) => toast.error(String(error)))
                        .finally(() => setSwitchingKey(null))
                    })
                  }
                  onConfigure={(trigger) => {
                    if (selectedCard?.project.key === card.project.key) {
                      return
                    }
                    leave(() => {
                      configurationTrigger.current = trigger
                      setConfigurationKey(card.project.key)
                      setDraftDirty(false)
                      setConfigurationBusy(false)
                    })
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {selectedCard?.primaryRepo ? (
          <ProjectSettingsRail
            key={selectedCard.project.key}
            card={selectedCard}
            onClose={closeConfiguration}
            discardRef={discardCurrent}
            onDirtyChange={setDraftDirty}
            onBusyChange={setConfigurationBusy}
            busyRepoId={busyRepoId}
            leave={leave}
            onChanged={() => setAdoptionToken((n) => n + 1)}
            onAddRepo={() =>
              leave(() => {
                void startAddRepoSlot(selectedCard.project).catch((error) =>
                  toast.error(String(error))
                )
              })
            }
            onRemoveRepo={(repoId) =>
              leave(() => {
                setBusyRepoId(repoId)
                void removeRepoFromWallProject({ project: selectedCard.project, repoId })
                  .catch((error) => toast.error(String(error)))
                  .finally(() => setBusyRepoId(null))
              })
            }
          />
        ) : null}
        <ImportBuilderHostsDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={refreshWall}
        />
        <Dialog
          open={leaveAction !== null}
          onOpenChange={(open) => {
            if (!open) {
              setLeaveAction(null)
            }
          }}
        >
          <DialogContent showCloseButton={false}>
            <DialogTitle>还有未提交的变更</DialogTitle>
            <DialogDescription>离开当前配置会丢弃这些变更。</DialogDescription>
            <div className="wb-config-actions">
              <button
                type="button"
                className="wb-btn wb-btn-secondary"
                onClick={() => setLeaveAction(null)}
              >
                继续编辑
              </button>
              <button
                type="button"
                className="wb-btn wb-btn-ghost"
                onClick={() => {
                  const action = leaveAction
                  discardCurrent.current?.()
                  setLeaveAction(null)
                  setDraftDirty(false)
                  action?.()
                }}
              >
                丢弃并离开
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
