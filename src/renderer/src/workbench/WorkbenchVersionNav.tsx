import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { useBrowsedVersion } from './version-context-state'
import { navigateVersionWorkflow, openVersionTasks } from './version-nav-actions'
import { VersionCleanupDialog } from './version-cleanup-dialog'
import { VersionTreeBindDialog } from './version-tree-bind-dialog'
import { VersionNavGroup } from './version-nav-group'
import { NewVersionDialog, type NewVersionDialogRequest } from './NewVersionDialog'
import { openGoalStartComposer } from './goal-start-action'
import { openGoalWorkspace } from './scoped-task-workspace'
import { openVersionOverview, useProjectPage } from './project-page-state'
import { loadVersionPlanDocument } from './version-task-entries'
import { useCycleView } from './cycle-view-state'

/**
 * G2 侧栏版本区（P3a，高保真修订 8）：版本平铺（旧版本默认收起即退休形态，
 * 可展开回看）；每版含计划/任务/目标目录/验收行；「＋ 新建版本」轻表单接
 * workbench.versionWorkspace.prepare；版本行删除图标接清理占位（生产删除 UI
 * 需求不变，确认单与原生删除链后续交付）。目录永远现算，读取失败如实呈现。
 */

type DialogState =
  | NewVersionDialogRequest
  | { mode: 'cleanup'; version: string }
  | { mode: 'bind'; version: string }
  | null

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

export function WorkbenchVersionNav(): React.JSX.Element | null {
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

  const expandedKey = repoId ? `workbench.version-expanded:${repoId}` : null
  const [expandedOverride, setExpandedOverride] = useState<Set<string> | null>(null)
  useEffect(() => {
    setExpandedOverride(readExpandedStore(expandedKey))
  }, [expandedKey])

  const loaded = catalog.catalog
  const entries = useMemo(() => loaded?.entries ?? [], [loaded])
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

  const toggleVersion = useCallback(
    (version: string) => {
      const next = new Set(expandedVersions)
      if (next.has(version)) {
        next.delete(version)
      } else {
        next.add(version)
      }
      setExpandedOverride(next)
      try {
        if (expandedKey) {
          window.localStorage.setItem(expandedKey, JSON.stringify([...next]))
        }
      } catch {
        // 存储被拒时本会话导航不受影响。
      }
    },
    [expandedVersions, expandedKey]
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

  const startGoal = useCallback(
    (version: string, goal: { goalId: string; label: string; title: string }) =>
      busy(`${version}:${goal.goalId}:start`, async () => {
        const entry = entries.find((item) => item.version === version) ?? null
        const read =
          catalog.scope && catalog.home
            ? await loadVersionPlanDocument({
                scope: catalog.scope,
                homeWorktreeId: catalog.home.id,
                version,
                entry,
                planTrees: catalog.planTrees
              })
            : { document: null, problem: '项目工作区尚未就绪' }
        const full = read.document?.goals.find((item) => item.goalId === goal.goalId)
        if (!read.document) {
          toast.info(
            `计划材料不可读（${read.problem ?? '原因未知'}）：目标上下文按已知信息预填，约定项标「待明确」。`
          )
        }
        openGoalStartComposer({
          version,
          goal: {
            goalId: goal.goalId,
            label: goal.label,
            title: full?.title ?? goal.title,
            ...(full?.deliverable !== undefined ? { deliverable: full.deliverable } : {}),
            ...(full?.acceptance !== undefined ? { acceptance: full.acceptance } : {})
          },
          references: read.document?.tasks ?? [],
          home:
            catalog.scope && catalog.home
              ? {
                  repoId: catalog.home.repoId,
                  projectId: catalog.scope.projectId,
                  hostId: catalog.scope.hostId,
                  ...(catalog.scope.runtimeOwnerEnvironmentId
                    ? { runtimeOwnerEnvironmentId: catalog.scope.runtimeOwnerEnvironmentId }
                    : {})
                }
              : null
        })
      }),
    [busy, catalog, entries]
  )

  if (!repoId) {
    return null
  }

  const problems = loaded?.problems ?? []

  return (
    <div className="wb-versions flex flex-col" data-workbench-versions>
      <div className="mt-2 flex items-center justify-between px-2 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-worktree-sidebar-foreground/45">
          版本
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="新建版本"
          title="新建版本"
          onClick={() => setDialog({ mode: 'create' })}
          className="size-6 text-worktree-sidebar-foreground/55 hover:text-worktree-sidebar-foreground"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        className="mx-2 mb-1 border-t border-worktree-sidebar-foreground/10"
      />

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

      <div className="flex flex-col gap-0.5">
        {entries.map((entry) => {
          const activeWorkflow: VersionWorkflow | null =
            activeBinding && activeBinding.version === entry.version
              ? activeBinding.workflow === 'plan' || activeBinding.workflow === 'acceptance'
                ? activeBinding.workflow
                : null
              : activeView === 'artifacts' && browsedVersion === entry.version
                ? cycleView
                : null
          return (
            <VersionNavGroup
              key={entry.version}
              entry={entry}
              expanded={expandedVersions.has(entry.version)}
              browsed={browsedVersion === entry.version}
              busy={busyKey !== null}
              worktrees={catalog.worktrees}
              activeWorkflow={
                activeView === 'terminal' || activeView === 'artifacts' ? activeWorkflow : null
              }
              activeTasks={
                activeView === 'tasks' && taskScope?.version === entry.version && !taskScope?.goalId
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
              onBindTree={() => setDialog({ mode: 'bind', version: entry.version })}
              onNavigateWorkflow={(workflow) =>
                navigateVersionWorkflow({
                  catalog,
                  version: entry.version,
                  workflow,
                  projectKey: repoId
                })
              }
              onPrepare={() => setDialog({ mode: 'prepare', version: entry.version })}
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
              onStartGoal={(goal) => void startGoal(entry.version, goal)}
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
      {dialog?.mode === 'bind' ? (
        <VersionTreeBindDialog
          version={dialog.version}
          entry={entries.find((item) => item.version === dialog.version) ?? null}
          worktrees={catalog.worktrees}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog && dialog.mode !== 'cleanup' && dialog.mode !== 'bind' ? (
        <NewVersionDialog
          request={dialog}
          catalog={catalog}
          projectKey={repoId}
          projectName={projectName}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}
