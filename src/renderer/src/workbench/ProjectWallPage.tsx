import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileInput, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSettingsRail } from './ProjectSettingsRail'
import { charterSourceKey } from './charter-snapshot'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { closeProjectPage, openAddProject } from './project-page-state'
import { switchActiveProject } from './switch-active-project'
import { continueProjectWork } from './continue-project-work'
import { isWallRowVisible, wallProjectVisibility } from './workbench-wall-projects'
import { buildWallHostFact } from './wall-host-facts'
import { useWallCharters } from './use-wall-charters'
import { ImportBuilderHostsDialog } from './ImportBuilderHostsDialog'
import { ProjectWallCard, type WallCardView } from './ProjectWallCard'
import { useWallReadings } from './use-wall-readings'
import { useWallProjects } from './use-wall-projects'
import { refreshProjectWall, useWallRefresh } from './wall-refresh'
import { useWallNativeProjectActions } from './wall-native-project-actions'
import { navigateVersionWorkflow, openVersionTasks } from './version-nav-actions'
import './workbench-wall.css'
import './project-settings.css'

export function ProjectWallPage() {
  const repos = useAppStore((s) => s.repos)
  const environments = useAppStore((s) => s.runtimeEnvironments)
  const statuses = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const sshLabels = useAppStore((s) => s.sshTargetLabels)
  const refresh = useWallRefresh()
  const { refreshing, partialRefresh, updatedAt } = refresh
  const [importOpen, setImportOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('all')
  const [type, setType] = useState('all')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null)
  const discard = useRef<(() => void) | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const hasProjects = repos.some(isWallRowVisible)
  const projects = useWallProjects({ location, type })
  const charters = useWallCharters(projects, refresh)
  const readings = useWallReadings(projects, refresh)
  const cardReadFailed = charters.failed || readings.failed
  const cards: WallCardView[] = projects.map((project) => {
    const charter = charters.values[project.key] ?? null
    return {
      project,
      primaryRepo: project.rows[0],
      charter,
      displayName: project.group?.name || charter?.name?.trim() || project.name,
      readings: readings.values[project.key] ?? { kind: 'loading' },
      hostTags: project.hostIds.map((hostId) => ({
        ...buildWallHostFact(hostId, environments, statuses, sshLabels),
        hostId,
        isLocal: hostId === 'local'
      }))
    }
  })
  const selectedCard = cards.find((card) => card.project.key === selected)
  const leave = (action: () => void) => {
    if (busy) {
      return
    }
    if (dirty) {
      setLeaveAction(() => action)
    } else {
      action()
    }
  }
  const native = useWallNativeProjectActions(leave)
  const filtered = cards.filter((card) =>
    card.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  return (
    <TooltipProvider>
      <div className="wb-wall-page" aria-label="项目墙" data-screen="wall">
        <main className="wb-wall">
          <header className="page-head">
            <div>
              <h1>
                项目墙 <small>{cards.length} 个项目</small>
              </h1>
            </div>
            <div className="page-actions" role="group" aria-label="项目墙操作">
              <WorkbenchIconButton
                label="刷新项目目录和墙卡信息"
                icon={refreshing ? LoaderCircle : RefreshCw}
                className={refreshing ? 'wb-icon-spin' : ''}
                disabled={refreshing}
                onClick={() => void refreshProjectWall()}
                data-workbench-refresh
              />
              <WorkbenchIconButton
                label="批量导入主机"
                icon={FileInput}
                onClick={() => setImportOpen(true)}
                data-workbench-import-hosts
              />
              <WorkbenchIconButton
                label="添加项目"
                icon={Plus}
                onClick={() => leave(openAddProject)}
                data-workbench-onboard
              />
              <WorkbenchIconButton
                label="关闭项目墙"
                icon={X}
                onClick={() => leave(closeProjectPage)}
              />
            </div>
          </header>
          <p className="wall-principles">聚焦目标 · 关注引领指标 · 建立记分表 · 保持问责节奏</p>
          {hasProjects && (
            <div className="wallbar">
              <Input
                aria-label="搜索项目"
                placeholder="搜索项目"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div role="group" aria-label="项目来源">
                {[
                  ['all', '全部'],
                  ['local', '本机'],
                  ['remote', '远程']
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="xs"
                    variant={location === value ? 'secondary' : 'ghost'}
                    aria-pressed={location === value}
                    onClick={() => leave(() => setLocation(value))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div role="group" aria-label="项目类型">
                {[
                  ['all', '全部类型'],
                  ['team', '团队'],
                  ['personal', '个人']
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="xs"
                    variant={type === value ? 'secondary' : 'ghost'}
                    aria-pressed={type === value}
                    onClick={() => leave(() => setType(value))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <span
                title={
                  partialRefresh
                    ? '部分主机未连接，保留上次读取结果；恢复连接后可刷新'
                    : cardReadFailed
                      ? '部分名片读取失败，保留已读结果，可点刷新重试'
                      : '刷新会重读已登记主机的项目、工作区及墙卡信息，不会更新代码仓'
                }
              >
                {refreshing
                  ? '刷新中…'
                  : partialRefresh
                    ? '部分主机未更新'
                    : cardReadFailed
                      ? '部分墙卡信息未更新'
                      : updatedAt && (charters.loading || readings.loading)
                        ? '读取墙卡信息…'
                        : updatedAt
                          ? `目录刷新于 ${updatedAt}`
                          : ''}
              </span>
            </div>
          )}
          {!hasProjects ? (
            <div className="empty-center">
              <h2>从一个项目开始</h2>
              <p>打开已有文件夹、克隆代码仓，或新建项目。</p>
              <Button onClick={openAddProject}>添加项目</Button>
            </div>
          ) : !filtered.length ? (
            <p className="empty-center">没有匹配的项目</p>
          ) : (
            (['team', 'personal'] as const).map((category) => {
              const items = filtered.filter(
                (card) => wallProjectVisibility(card.project) === category
              )
              return (
                items.length > 0 && (
                  <section className="wall-group" key={category}>
                    <h2>
                      {category === 'team' ? '团队项目' : '个人项目'} <small>{items.length}</small>
                    </h2>
                    <div className="wall-grid">
                      {items.map((card) => (
                        <ProjectWallCard
                          key={card.project.key}
                          card={card}
                          switching={switching === card.project.key}
                          configured={selectedCard?.project.key === card.project.key}
                          nativeMenu={native.projectMenu(card.project)}
                          repoMenu={native.repoMenu}
                          onRepoSettings={native.settingsFor}
                          onClone={(slot) =>
                            leave(() =>
                              useAppStore
                                .getState()
                                .openModal('add-repo', { initialCloneUrl: slot.remoteUrl })
                            )
                          }
                          onOpen={(repo = card.primaryRepo) =>
                            leave(() => {
                              setSwitching(card.project.key)
                              void continueProjectWork(repo)
                                .catch((error) => toast.error(String(error)))
                                .finally(() => setSwitching(null))
                            })
                          }
                          onOverview={() =>
                            leave(() => {
                              void switchActiveProject(
                                card.primaryRepo.id,
                                getRepoExecutionHostId(card.primaryRepo),
                                { location, type }
                              )
                            })
                          }
                          onConfigure={(button) =>
                            leave(() => {
                              trigger.current = button
                              setSelected(card.project.key)
                              setDirty(false)
                            })
                          }
                          onStage={(stage) =>
                            leave(() => {
                              if (card.readings.kind !== 'version') {
                                return
                              }
                              const { catalog, version } = card.readings
                              const repoId = catalog.scope?.repoId ?? card.primaryRepo.id
                              useAppStore.getState().setActiveRepo(repoId)
                              useAppStore.setState({
                                activeWorkspaceExecutionHostId: catalog.scope
                                  ?.runtimeOwnerEnvironmentId
                                  ? toRuntimeExecutionHostId(
                                      catalog.scope.runtimeOwnerEnvironmentId
                                    )
                                  : (catalog.scope?.hostId ??
                                    getRepoExecutionHostId(card.primaryRepo))
                              })
                              if (stage === 'tasks') {
                                void openVersionTasks({
                                  catalog,
                                  version,
                                  entry:
                                    catalog.catalog?.entries.find(
                                      (entry) => entry.version === version
                                    ) ?? null
                                }).catch((error) => toast.error(String(error)))
                              } else {
                                navigateVersionWorkflow({
                                  catalog,
                                  version,
                                  workflow: stage,
                                  projectKey: repoId
                                })
                              }
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                )
              )
            })
          )}
        </main>
        {selectedCard && (
          <ProjectSettingsRail
            key={charterSourceKey(selectedCard.primaryRepo)}
            repo={selectedCard.primaryRepo}
            rows={selectedCard.project.rows}
            displayName={selectedCard.displayName}
            onClose={() =>
              leave(() => {
                setSelected(null)
                setDirty(false)
                trigger.current?.focus()
              })
            }
            discardRef={discard}
            onDirtyChange={setDirty}
            onBusyChange={setBusy}
          />
        )}
        {native.dialogs}
        <ImportBuilderHostsDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={refreshProjectWall}
        />
        <Dialog
          open={leaveAction !== null}
          onOpenChange={(open) => {
            if (!open) {
              setLeaveAction(null)
            }
          }}
        >
          <DialogContent>
            <DialogTitle>还有未提交的修改</DialogTitle>
            <DialogDescription>离开当前设置会丢弃这些修改。</DialogDescription>
            <Button variant="ghost" onClick={() => setLeaveAction(null)}>
              继续编辑
            </Button>
            <Button
              onClick={() => {
                const action = leaveAction
                discard.current?.()
                setLeaveAction(null)
                setDirty(false)
                action?.()
              }}
            >
              丢弃并离开
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
