import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
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
import { VersionTreeBindDialog } from './version-tree-bind-dialog'
import { VersionNavGroup } from './version-nav-group'
import { NewVersionDialog } from './NewVersionDialog'
import { openGoalWorkspace } from './scoped-task-workspace'
import { openVersionOverview, useProjectPage } from './project-page-state'
import { useCycleView } from './cycle-view-state'

/**
 * G2 侧栏版本区（P3a/P3b/P6，高保真修订 8/9）：版本平铺（旧版本默认收起即退休
 * 形态，可展开回看）；每版含总览/计划/任务/目标目录/验收行；「＋ 新建版本」轻
 * 表单接 workbench.versionWorkspace.prepare；版本行另有「初始化工作区」（流程树
 * 不齐时显示，点击直接执行，#436 伴飞裁定）、「绑定已有工作树」（补绑定，人主
 * 导）与「清理」确认单（执行复用原生批量删除漏斗）。目录永远现算，读取失败如实
 * 呈现。
 */

type DialogState =
  | { mode: 'create' }
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
  const repos = useAppStore((s) => s.repos)
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
  // 显示序（#436 人裁定）：在制优先（在做的版本置顶）、组内版本号降序（新在前）、
  // 归档沉底；目录契约仍升序，仅显示层排序。
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
              ? isVersionFlowWorkflow(activeBinding.workflow)
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
              initializing={busyKey === `${entry.version}:init`}
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
                    goal,
                    entry
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
          repos={repos}
          scope={catalog.scope}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.mode === 'create' ? (
        <NewVersionDialog
          catalog={catalog}
          projectKey={repoId}
          projectName={projectName}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}
