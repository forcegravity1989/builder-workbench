import React, { useState } from 'react'
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  EllipsisVertical,
  GitBranch,
  ListTodo,
  Newspaper,
  Target
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { VersionNativeTrees } from './VersionNativeTrees'
import WorktreeContextMenu from '@/components/sidebar/WorktreeContextMenu'
import { getWorkspaceStatus } from '@/components/sidebar/workspace-status'
import { branchName } from '@/lib/git-utils'
import type { Worktree, WorkspaceStatusDefinition } from '../../../shared/worktree/types'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import { VERSION_TASKS_ENTRY_TITLE, WORKFLOW_SCREEN_LABELS } from './version-labels'
import { VersionWorktreeHostGlyph } from './version-worktree-host'

/**
 * G2 侧栏版本树的行组件（P3a，高保真修订 8）：流程行=业务入口＋本树入口合一
 * （点名称进屏、箭头展开原生 agent 行、菜单沿原生工作树菜单）；目标目录行=
 * 业务分组（点击筛选同一任务屏），目录下按绑定列目标/任务树。全部复用原生
 * agent 行、原生菜单与激活链，不另画一套生产组件。
 */

const ROW_CLASS =
  'flex w-full min-w-0 items-center gap-1 rounded-md py-1 pl-1 pr-0.5 text-left text-[12.5px] tracking-tight transition-colors'
const ROW_IDLE = 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
const ROW_ACTIVE = 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'

function ChevronToggle({
  expanded,
  onToggle,
  label
}: {
  expanded: boolean
  onToggle: () => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={expanded}
      className="flex size-5 shrink-0 items-center justify-center rounded text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
    >
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  )
}

function ChevronSpacer(): React.JSX.Element {
  return <span className="size-5 shrink-0" aria-hidden="true" />
}

export { VersionNativeTrees as BoundTreeRows } from './VersionNativeTrees'

type WorkflowRowProps = {
  version: string
  workflow: VersionWorkflow
  worktrees: readonly Worktree[]
  active: boolean
  busy: boolean
  onNavigate: () => void
}

/**
 * 计划/验收流程行：入口与固定工作树合为一行；分支名在悬停中可见。
 * 菜单形态（#436 伴飞裁定 CF-5/CF-6f）：0 棵=只有「未准备」徽标（行点击=只读
 * 回看；初始化入口在版本行）；1 棵=整行右击出原生工作树维护菜单（无三点）；
 * ≥2 棵=展开每棵实际工作树，每行沿同一个原生右键菜单。
 */
export function WorkflowRow({
  version,
  workflow,
  worktrees,
  active,
  busy,
  onNavigate
}: WorkflowRowProps): React.JSX.Element {
  const [agentsOpen, setAgentsOpen] = useState(true)
  const trees = findVersionFlowWorktrees(worktrees, { version, workflow })
  const Icon = workflow === 'plan' ? CalendarRange : ClipboardCheck
  const label = WORKFLOW_SCREEN_LABELS[workflow]
  const onlyTree = trees.length === 1 ? (trees[0] ?? null) : null
  const branchTitle = onlyTree
    ? `${branchName(onlyTree.branch)} · 本版固定工作区 · 右击出工作区维护菜单`
    : trees.length > 1
      ? `${trees.length} 个绑定实例 · 点击选择`
      : `未准备 · 点击只读回看${label}材料（初始化在版本行）`
  const row = (
    <div className={cn(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}>
      {trees.length > 0 ? (
        <ChevronToggle
          expanded={agentsOpen}
          onToggle={() => setAgentsOpen((open) => !open)}
          label={`${version} ${label}会话展开或收起`}
        />
      ) : (
        <ChevronSpacer />
      )}
      <button
        type="button"
        onClick={onNavigate}
        disabled={busy}
        title={branchTitle}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
      >
        <Icon
          className={cn('size-3.5 shrink-0', active ? '' : 'text-worktree-sidebar-foreground/35')}
        />
        <span className="truncate">{label}</span>
        {onlyTree ? <VersionWorktreeHostGlyph tree={onlyTree} /> : null}
        {trees.length === 0 ? (
          <span className="shrink-0 text-[10px] text-worktree-sidebar-foreground/40">未准备</span>
        ) : null}
      </button>
    </div>
  )
  return (
    <div className="min-w-0">
      {onlyTree ? <WorktreeContextMenu worktree={onlyTree}>{row}</WorktreeContextMenu> : row}
      {agentsOpen && trees.length > 0 ? (
        <div className="pl-6">
          <VersionNativeTrees trees={trees} sectionKey={`version:${version}:${workflow}`} />
        </div>
      ) : null}
    </div>
  )
}

type GoalRowProps = {
  version: string
  label: string
  title: string
  goalTrees: GoalDirectoryTreeGroups
  active: boolean
  busy: boolean
  onOpenTasks: () => void
  onPrepareStart: () => void
  onOpenWorkspace: () => void
}

/** 目标目录行：点名称=同一任务屏的目标筛选；「···」接 P4 目标开工 hook。
 * 完工树默认隐藏,「含 N 已完成」计数展开回看(会话态,重启回默认收起)。 */
export function GoalDirectoryRow({
  version,
  label,
  title,
  goalTrees,
  active,
  busy,
  onOpenTasks,
  onPrepareStart,
  onOpenWorkspace
}: GoalRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  // 完工回看是会话态:不落存储,重启回默认收起。
  const [showCompleted, setShowCompleted] = useState(false)
  const treeCount = goalTrees.active.length + goalTrees.completed.length
  const sectionBase = `version:${version}:goal:${
    normalizeStoredWorkbenchVersionBinding(
      (goalTrees.active[0] ?? goalTrees.completed[0])?.workbenchVersionBinding
    )?.goalId ?? label
  }`
  return (
    <div className="min-w-0">
      <div className={cn(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}>
        {treeCount > 0 ? (
          <ChevronToggle
            expanded={expanded}
            onToggle={() => setExpanded((open) => !open)}
            label={`${version} ${label} 目标目录展开或收起`}
          />
        ) : (
          <ChevronSpacer />
        )}
        <button
          type="button"
          onClick={onOpenTasks}
          disabled={busy}
          title={`${title} · 在同一任务屏筛选 ${label}`}
          aria-current={active ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
        >
          <Target
            className={cn('size-3.5 shrink-0', active ? '' : 'text-worktree-sidebar-foreground/35')}
          />
          <strong className="shrink-0 font-semibold">{label}</strong>
          <span className="truncate">{title}</span>
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              aria-label={`${version} ${label} 目标目录操作`}
              className="flex size-6 shrink-0 items-center justify-center rounded text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
            >
              <EllipsisVertical className="size-3.5" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={onPrepareStart} disabled={busy}>
              <GitBranch className="size-4" />
              目标开工
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenTasks} disabled={busy}>
              <ListTodo className="size-4" />
              查看目标任务
            </DropdownMenuItem>
            {treeCount > 0 ? (
              <DropdownMenuItem onSelect={onOpenWorkspace}>
                <ChevronRight className="size-4" />
                打开目标工作区
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? (
        <div className="pl-5">
          <VersionNativeTrees trees={goalTrees.active} sectionKey={sectionBase} />
          {goalTrees.completed.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowCompleted((open) => !open)}
              aria-expanded={showCompleted}
              className="mt-0.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
            >
              {showCompleted ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              {showCompleted
                ? `收起已完成（${goalTrees.completed.length}）`
                : `含 ${goalTrees.completed.length} 已完成`}
            </button>
          ) : null}
          {showCompleted && goalTrees.completed.length > 0 ? (
            <VersionNativeTrees
              trees={goalTrees.completed}
              sectionKey={`${sectionBase}:completed`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 完工判定只认原生看板状态的 completed id;树无状态走默认(非 completed),
 *  自定义状态集没有该 id 时无树判完工——宁可见,不误藏。 */
const COMPLETED_WORKSPACE_STATUS_ID = 'completed'

export type GoalDirectoryTreeGroups = {
  active: Worktree[]
  completed: Worktree[]
}

/** 目标目录体：业务归属分组（目标树 + 挂该目标的 Issue 树），不是原生 lineage。
 * 完工树（看板状态 completed）默认让位隐藏;活跃树内固定（isPinned）置顶,
 * 其余按 id 稳定排序。完工隐藏优先于置顶。 */
export function goalDirectoryTrees(
  worktrees: readonly Worktree[],
  version: string,
  goalId: string,
  statuses: readonly WorkspaceStatusDefinition[]
): GoalDirectoryTreeGroups {
  const active: Worktree[] = []
  const completed: Worktree[] = []
  for (const tree of worktrees) {
    if (tree.isArchived) {
      continue
    }
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    if (
      !binding ||
      binding.version !== version ||
      binding.goalId !== goalId ||
      (binding.workflow !== 'goal' && binding.workflow !== 'issue')
    ) {
      continue
    }
    if (getWorkspaceStatus(tree, statuses) === COMPLETED_WORKSPACE_STATUS_ID) {
      completed.push(tree)
    } else {
      active.push(tree)
    }
  }
  active.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.id.localeCompare(b.id))
  completed.sort((a, b) => a.id.localeCompare(b.id))
  return { active, completed }
}

/** 任务行（版本全部任务，无目标筛选）。 */
export function TasksRow({
  active,
  busy,
  onOpenTasks
}: {
  active: boolean
  busy: boolean
  onOpenTasks: () => void
}): React.JSX.Element {
  return (
    <div className={cn(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}>
      <ChevronSpacer />
      <button
        type="button"
        onClick={onOpenTasks}
        disabled={busy}
        title={VERSION_TASKS_ENTRY_TITLE}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
      >
        <ListTodo
          className={cn('size-3.5 shrink-0', active ? '' : 'text-worktree-sidebar-foreground/35')}
        />
        <span>任务</span>
      </button>
    </div>
  )
}

/** G2（P6）：每版「总览」行——版本总览页（表格周报风格，只读派生）。 */
export function OverviewRow({
  active,
  onOpenOverview
}: {
  active: boolean
  onOpenOverview: () => void
}): React.JSX.Element {
  return (
    <div className={cn(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}>
      <ChevronSpacer />
      <button
        type="button"
        onClick={onOpenOverview}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
      >
        <Newspaper
          className={cn('size-3.5 shrink-0', active ? '' : 'text-worktree-sidebar-foreground/35')}
        />
        <span>总览</span>
      </button>
    </div>
  )
}
