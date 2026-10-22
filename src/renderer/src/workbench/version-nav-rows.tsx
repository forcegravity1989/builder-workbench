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
import WorktreeCardAgents from '@/components/sidebar/WorktreeCardAgents'
import WorktreeContextMenu from '@/components/sidebar/WorktreeContextMenu'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { branchName } from '@/lib/git-utils'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import { WORKFLOW_SCREEN_LABELS } from './version-labels'

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

/** 绑定树行（目标目录体）：名称点击激活（原生链），箭头展开原生 agent 行，···沿原生菜单。 */
function BoundTreeRow({ tree }: { tree: Worktree }): React.JSX.Element {
  const [agentsOpen, setAgentsOpen] = useState(true)
  const branch = branchName(tree.branch)
  const label = tree.displayName.trim() || branch
  return (
    <div className="min-w-0">
      <div className={cn(ROW_CLASS, ROW_IDLE)}>
        <ChevronToggle
          expanded={agentsOpen}
          onToggle={() => setAgentsOpen((open) => !open)}
          label={`${label} 会话展开或收起`}
        />
        <button
          type="button"
          title={branch}
          onClick={() =>
            activateAndRevealWorktree(tree.id, {
              ...(tree.hostId ? { executionHostId: tree.hostId } : {})
            })
          }
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-worktree-sidebar-foreground/8"
        >
          <GitBranch className="size-3.5 shrink-0 text-worktree-sidebar-foreground/40" />
          <span className="truncate">{label}</span>
        </button>
        <WorktreeContextMenu worktree={tree}>
          <span
            role="button"
            tabIndex={0}
            aria-label={`${label} 工作树菜单`}
            className="flex size-6 shrink-0 items-center justify-center rounded text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
          >
            <EllipsisVertical className="size-3.5" />
          </span>
        </WorktreeContextMenu>
      </div>
      {agentsOpen ? (
        <div className="pl-6">
          <WorktreeCardAgents worktreeId={tree.id} />
        </div>
      ) : null}
    </div>
  )
}

export type WorkflowRowProps = {
  version: string
  workflow: VersionWorkflow
  worktrees: readonly Worktree[]
  active: boolean
  busy: boolean
  onNavigate: () => void
  onPrepare: () => void
}

/** 计划/验收流程行：入口与固定工作树合为一行；分支名在悬停中可见。 */
export function WorkflowRow({
  version,
  workflow,
  worktrees,
  active,
  busy,
  onNavigate,
  onPrepare
}: WorkflowRowProps): React.JSX.Element {
  const [agentsOpen, setAgentsOpen] = useState(true)
  const trees = findVersionFlowWorktrees(worktrees, { version, workflow })
  const Icon = workflow === 'plan' ? CalendarRange : ClipboardCheck
  const label = WORKFLOW_SCREEN_LABELS[workflow]
  const onlyTree = trees.length === 1 ? trees[0] : null
  const branchTitle = onlyTree
    ? `${branchName(onlyTree.branch)} · 本版固定工作区`
    : trees.length > 1
      ? `${trees.length} 个绑定实例 · 点击选择`
      : `未准备 · 点击${label}入口查看可用路径`
  return (
    <div className="min-w-0">
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
          {trees.length === 0 ? (
            <span className="shrink-0 text-[10px] text-worktree-sidebar-foreground/40">未准备</span>
          ) : null}
        </button>
        {trees.length === 1 && trees[0] ? (
          <WorktreeContextMenu worktree={trees[0]}>
            <span
              role="button"
              tabIndex={0}
              aria-label={`${version} ${label}工作区菜单`}
              className="flex size-6 shrink-0 items-center justify-center rounded text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
            >
              <EllipsisVertical className="size-3.5" />
            </span>
          </WorktreeContextMenu>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-label={`${version} ${label}工作区操作`}
                className="flex size-6 shrink-0 items-center justify-center rounded text-worktree-sidebar-foreground/45 hover:text-worktree-sidebar-foreground"
              >
                <EllipsisVertical className="size-3.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {trees.length > 1
                ? trees.map((tree) => (
                    <DropdownMenuItem
                      key={getWorktreeHostIdentity(tree)}
                      onSelect={() =>
                        activateAndRevealWorktree(tree.id, {
                          ...(tree.hostId ? { executionHostId: tree.hostId } : {})
                        })
                      }
                    >
                      <GitBranch className="size-4" />
                      {branchName(tree.branch)}
                    </DropdownMenuItem>
                  ))
                : null}
              <DropdownMenuItem onSelect={onPrepare}>
                <ListTodo className="size-4" />
                准备流程工作区
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {agentsOpen && trees.length > 0 ? (
        <div className="pl-6">
          {trees.map((tree) => (
            <WorktreeCardAgents key={getWorktreeHostIdentity(tree)} worktreeId={tree.id} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export type GoalRowProps = {
  version: string
  label: string
  title: string
  goalTrees: Worktree[]
  active: boolean
  busy: boolean
  onOpenTasks: () => void
  onPrepareStart: () => void
  onOpenWorkspace: () => void
}

/** 目标目录行：点名称=同一任务屏的目标筛选；「···」接 P4 目标开工 hook。 */
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
  return (
    <div className="min-w-0">
      <div className={cn(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}>
        {goalTrees.length > 0 ? (
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
            {goalTrees.length > 0 ? (
              <DropdownMenuItem onSelect={onOpenWorkspace}>
                <ChevronRight className="size-4" />
                打开目标工作区
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded
        ? goalTrees.map((tree) => (
            <div key={getWorktreeHostIdentity(tree)} className="pl-5">
              <BoundTreeRow tree={tree} />
            </div>
          ))
        : null}
    </div>
  )
}

/** 目标目录体：业务归属分组（目标树 + 挂该目标的 Issue 树），不是原生 lineage。 */
export function goalDirectoryTrees(
  worktrees: readonly Worktree[],
  version: string,
  goalId: string
): Worktree[] {
  return worktrees
    .filter((tree) => {
      if (tree.isArchived) {
        return false
      }
      const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
      return (
        !!binding &&
        binding.version === version &&
        binding.goalId === goalId &&
        (binding.workflow === 'goal' || binding.workflow === 'issue')
      )
    })
    .sort((a, b) => a.id.localeCompare(b.id))
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
