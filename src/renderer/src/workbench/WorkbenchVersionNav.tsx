import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { isVersionFlowWorkflow } from '../../../shared/workbench/version-workspace-prepare'
import { Button } from '@/components/ui/button'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { compareMaterialVersions } from '../../../shared/workbench/version-catalog'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { useBrowsedVersion } from './version-context-state'
import {
  initializeVersionWorkspace,
  navigateVersionWorkflow,
  openVersionTasks,
  startVersionGoal
} from './version-nav-actions'
import { VersionCleanupDialog } from './version-cleanup-dialog'
import { VersionNavGroup } from './version-nav-group'
import { NewVersionDialog } from './NewVersionDialog'
import { openGoalWorkspace } from './scoped-task-workspace'
import { openVersionOverview, useProjectPage } from './project-page-state'
import { WorkbenchSidebarSectionHeader } from './WorkbenchSidebarSectionHeader'
import { useCycleView } from './cycle-view-state'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { VersionTreeDisplayProvider, type VersionTreeDisplayInput } from './VersionNativeTrees'
import {
  consumeVersionSidebarFocus,
  publishVersionSidebarProjection,
  useVersionSidebarFocusRequest
} from './version-sidebar-state'

type DialogState = { mode: 'create' } | { mode: 'cleanup'; version: string } | null

function readExpandedStore(key: string | null): Set<string> | null {
  if (!key) {
    return null
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : null
  } catch {
    return null
  }
}

export function WorkbenchVersionNav({
  nativeDisplay
}: {
  nativeDisplay: VersionTreeDisplayInput
}): React.JSX.Element | null {
  const repoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const projectName = useAppStore((s) => {
    const active = s.activeRepoId ?? s.repos[0]?.id ?? null
    return s.repos.find((repo) => repo.id === active)?.displayName?.trim() || null
  })
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktree = useAppStore((s) =>
    s.activeWorktreeId ? s.getKnownWorktreeById(s.activeWorktreeId) : null
  )
  const taskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const cycleView = useCycleView()
  const projectPage = useProjectPage()
  const overviewVersion =
    activeView === 'activity' && projectPage?.kind === 'version-overview'
      ? projectPage.options.version
      : null
  const catalog = useVersionCatalogForRepo(repoId)
  const browsedVersion = useBrowsedVersion(repoId)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const focusRequest = useVersionSidebarFocusRequest()
  const versionElements = useRef(new Map<string, HTMLDivElement>())

  const expandedKey = repoId ? `workbench.version-expanded:${repoId}` : null
  // Expansion belongs to the project, including an explicitly collapsed empty set.
  const [expandedByProject, setExpandedByProject] = useState<Record<string, Set<string>>>({})
  const expandedOverride = useMemo(
    () => (expandedKey ? (expandedByProject[expandedKey] ?? readExpandedStore(expandedKey)) : null),
    [expandedByProject, expandedKey]
  )
  const setExpandedOverrideAndStore = useCallback(
    (versions: Set<string>) => {
      if (!expandedKey) {
        return
      }
      setExpandedByProject((current) => ({ ...current, [expandedKey]: versions }))
      try {
        window.localStorage.setItem(expandedKey, JSON.stringify([...versions]))
      } catch {
        // 存储被拒时本会话导航不受影响。
      }
    },
    [expandedKey]
  )

  const loaded = catalog.catalog
  // 目录契约保持升序；侧栏按在制优先、组内版本降序展示。
  const entries = useMemo(() => {
    const rows = loaded?.entries ?? []
    return [...rows].sort((a, b) => {
      if (a.state !== b.state) {
        return a.state === 'working' ? -1 : 1
      }
      return compareMaterialVersions(b.version, a.version)
    })
  }, [loaded])
  const expandedVersions = useMemo(() => {
    if (expandedOverride) {
      return expandedOverride
    }
    // 默认姿态：在制版本与当前浏览版本展开；历史（retired）收起、可展开回看。
    const seeded = new Set(
      entries.filter((entry) => entry.state === 'working').map((entry) => entry.version)
    )
    if (browsedVersion) {
      seeded.add(browsedVersion)
    }
    return seeded
  }, [expandedOverride, entries, browsedVersion])

  useEffect(() => {
    const versions = new Set(entries.map((entry) => entry.version))
    publishVersionSidebarProjection({
      repoId,
      repoIds: catalog.repoIds,
      worktreeIdentities: new Set(
        catalog.worktrees
          .filter((tree) => {
            const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
            return !tree.isArchived && !!binding && versions.has(binding.version)
          })
          .map(getWorktreeHostIdentity)
      )
    })
  }, [repoId, catalog.repoIds, catalog.worktrees, entries])

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.repoId !== repoId ||
      (!entries.some((entry) => entry.state === 'working') &&
        !catalog.materialReady &&
        !catalog.error &&
        !catalog.materialError)
    ) {
      return
    }
    consumeVersionSidebarFocus(focusRequest.sequence)
    const latest = entries.find((entry) => entry.state === 'working') ?? entries[0]
    if (!latest) {
      return
    }
    setExpandedOverrideAndStore(new Set([...expandedVersions, latest.version]))
    requestAnimationFrame(() => {
      if (useAppStore.getState().activeRepoId === repoId) {
        versionElements.current
          .get(latest.version)
          ?.querySelector('button')
          ?.scrollIntoView({ block: 'nearest' })
      }
    })
  }, [
    focusRequest,
    repoId,
    catalog.materialReady,
    catalog.error,
    catalog.materialError,
    entries,
    expandedVersions,
    setExpandedOverrideAndStore
  ])

  const toggleVersion = useCallback(
    (version: string) => {
      const next = new Set(expandedVersions)
      if (next.has(version)) {
        next.delete(version)
      } else {
        next.add(version)
      }
      setExpandedOverrideAndStore(next)
    },
    [expandedVersions, setExpandedOverrideAndStore]
  )

  const activeBinding = useMemo(
    () => normalizeStoredWorkbenchVersionBinding(activeWorktree?.workbenchVersionBinding),
    [activeWorktree]
  )

  const busy = useCallback(
    async (key: string, run: () => Promise<void>) => {
      if (busyKey) {
        return
      }
      setBusyKey(key)
      try {
        await run()
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusyKey(null)
      }
    },
    [busyKey]
  )

  if (!repoId) {
    return null
  }

  const problems = loaded?.problems ?? []

  const content = (
    <div className="wb-versions flex min-h-0 min-w-0 flex-col" data-workbench-versions>
      <WorkbenchSidebarSectionHeader
        icon={Layers}
        action={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="新建版本"
            title="新建版本"
            onClick={() => setDialog({ mode: 'create' })}
            className="size-6"
          >
            <Plus className="size-3.5" />
          </Button>
        }
      >
        版本
      </WorkbenchSidebarSectionHeader>

      {catalog.error ? (
        <div className="px-2 py-1 text-[11px] text-destructive">
          <p>版本目录读取失败：{catalog.error}</p>
          <button type="button" className="underline" onClick={catalog.reload}>
            重试
          </button>
        </div>
      ) : null}
      {!catalog.error && catalog.loading && entries.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-worktree-sidebar-foreground/45">版本目录读取中…</p>
      ) : null}
      {!catalog.error && !catalog.loading && entries.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-worktree-sidebar-foreground/45">
          暂无版本 · 保存版本计划或从「＋ 新建版本」开始
        </p>
      ) : null}
      {problems.length > 0 ? (
        <p
          className="px-2 pb-1 text-[10.5px] text-worktree-sidebar-foreground/45"
          title={problems.map((problem) => problem.message).join('\n')}
        >
          {problems.length} 项材料读取问题（悬停查看）
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-0.5">
        {entries.map((entry) => {
          const activeWorkflow: VersionWorkflow | null =
            activeBinding && activeBinding.version === entry.version
              ? isVersionFlowWorkflow(activeBinding.workflow)
                ? activeBinding.workflow
                : null
              : activeView === 'artifacts' && browsedVersion === entry.version
                ? cycleView
                : null
          return (
            <div
              key={entry.version}
              ref={(node) => {
                if (node) {
                  versionElements.current.set(entry.version, node)
                } else {
                  versionElements.current.delete(entry.version)
                }
              }}
            >
              <VersionNavGroup
                key={entry.version}
                entry={entry}
                expanded={expandedVersions.has(entry.version)}
                browsed={browsedVersion === entry.version}
                busy={busyKey !== null}
                initializing={busyKey === `${entry.version}:init`}
                worktrees={catalog.worktrees}
                activeWorkflow={
                  activeView === 'terminal' || activeView === 'artifacts' ? activeWorkflow : null
                }
                activeTasks={
                  activeView === 'tasks' &&
                  taskScope?.version === entry.version &&
                  !taskScope?.goalId
                }
                activeOverview={overviewVersion === entry.version}
                onOverview={() => openVersionOverview({ repoId, version: entry.version })}
                activeGoalId={
                  activeView === 'tasks' && taskScope?.version === entry.version
                    ? (taskScope?.goalId ?? null)
                    : null
                }
                onToggle={() => toggleVersion(entry.version)}
                onCleanup={() => setDialog({ mode: 'cleanup', version: entry.version })}
                onNavigateWorkflow={(workflow) =>
                  navigateVersionWorkflow({
                    catalog,
                    version: entry.version,
                    workflow,
                    projectKey: repoId
                  })
                }
                onInitialize={() =>
                  void busy(`${entry.version}:init`, async () => {
                    await initializeVersionWorkspace({ catalog, version: entry.version })
                  })
                }
                onOpenTasks={(goal) =>
                  void busy(`${entry.version}:${goal?.goalId ?? 'all'}:tasks`, async () => {
                    await openVersionTasks({
                      catalog,
                      version: entry.version,
                      goal: goal ?? null,
                      entry
                    })
                  })
                }
                onStartGoal={(goal) =>
                  void busy(`${entry.version}:${goal.goalId}:start`, async () => {
                    await startVersionGoal({
                      catalog,
                      version: entry.version,
                      goal
                    })
                  })
                }
                onOpenGoalWorkspace={(goal) => {
                  const opened = openGoalWorkspace({
                    version: entry.version,
                    goalId: goal.goalId,
                    label: `${goal.label} · ${goal.title}`,
                    worktrees: catalog.worktrees
                  })
                  if (!opened) {
                    toast.info('此目标尚无工作区；可用「目标开工」按需创建。')
                  }
                }}
              />
            </div>
          )
        })}
      </div>

      {dialog?.mode === 'cleanup' ? (
        <VersionCleanupDialog
          version={dialog.version}
          entry={entries.find((item) => item.version === dialog.version) ?? null}
          worktrees={catalog.worktrees}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.mode === 'create' ? (
        <NewVersionDialog
          catalog={catalog}
          projectKey={repoId}
          projectName={projectName}
          onCreated={(version) =>
            setExpandedOverrideAndStore(new Set([...expandedVersions, version]))
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
  return (
    <VersionTreeDisplayProvider value={nativeDisplay} trees={catalog.worktrees}>
      {content}
    </VersionTreeDisplayProvider>
  )
}
