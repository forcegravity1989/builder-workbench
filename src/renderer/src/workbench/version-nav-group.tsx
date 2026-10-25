import { goalOrdinal } from './version-labels'
import React from 'react'
import { ChevronDown, ChevronRight, Link2, PackageCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import {
  GoalDirectoryRow,
  OverviewRow,
  TasksRow,
  WorkflowRow,
  goalDirectoryTrees
} from './version-nav-rows'

/**
 * G2 侧栏单个版本组（P3a/P3b/P6）：版本行（展开/收起＋退休标识＋补绑定与清理
 * 入口）与子行（总览/计划/任务/目标目录/验收）。归属判定与动作编排在父组件，
 * 本组件只做呈现与原生复用件组装。
 */

type VersionNavGroupProps = {
  entry: VersionCatalogEntry
  expanded: boolean
  browsed: boolean
  busy: boolean
  worktrees: readonly Worktree[]
  /** 当前点亮的流程（'plan'|'acceptance'），null=无。 */
  activeWorkflow: VersionWorkflow | null
  activeTasks: boolean
  activeOverview: boolean
  activeGoalId: string | null
  onToggle: () => void
  onCleanup: () => void
  onBindTree: () => void
  onOverview: () => void
  onNavigateWorkflow: (workflow: VersionWorkflow) => void
  onPrepare: () => void
  onOpenTasks: (goal?: { goalId: string; label: string }) => void
  onStartGoal: (goal: { goalId: string; label: string; title: string }) => void
  onOpenGoalWorkspace: (goal: { goalId: string; label: string; title: string }) => void
}

export function VersionNavGroup({
  entry,
  expanded,
  browsed,
  busy,
  worktrees,
  activeWorkflow,
  activeTasks,
  activeOverview,
  activeGoalId,
  onToggle,
  onCleanup,
  onBindTree,
  onOverview,
  onNavigateWorkflow,
  onPrepare,
  onOpenTasks,
  onStartGoal,
  onOpenGoalWorkspace
}: VersionNavGroupProps): React.JSX.Element {
  const retired = entry.state === 'retired'
  return (
    <div className="wb-version-group min-w-0">
      <div className="flex min-w-0 items-center gap-0.5 pr-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${entry.version} 展开或收起`}
          title={
            retired ? '无存活工作区绑定（已清理或未准备）；材料可回看' : '在制（有存活绑定工作区）'
          }
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-[13px] tracking-tight transition-colors hover:bg-worktree-sidebar-foreground/8',
            browsed ? 'text-worktree-sidebar-foreground' : 'text-worktree-sidebar-foreground/70'
          )}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-worktree-sidebar-foreground/45" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-worktree-sidebar-foreground/45" />
          )}
          <PackageCheck
            className={cn(
              'size-4 shrink-0',
              retired
                ? 'text-worktree-sidebar-foreground/30'
                : 'text-worktree-sidebar-foreground/60'
            )}
          />
          <strong className={cn('truncate', retired && 'font-medium opacity-70')}>
            {entry.version}
          </strong>
          {retired ? (
            <span className="shrink-0 rounded-full border border-worktree-sidebar-foreground/15 px-1.5 text-[9.5px] text-worktree-sidebar-foreground/45">
              历史
            </span>
          ) : null}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`绑定已有工作树到 ${entry.version}（补绑定）`}
          title={`绑定已有工作树到 ${entry.version}（补绑定，人显式断言归属）`}
          onClick={onBindTree}
          className="size-6 shrink-0 text-worktree-sidebar-foreground/40 hover:text-worktree-sidebar-foreground"
        >
          <Link2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`清理 ${entry.version} 工作树`}
          title={`清理 ${entry.version} 工作树（勾选后进入 Orca 删除确认）`}
          onClick={onCleanup}
          className="size-6 shrink-0 text-worktree-sidebar-foreground/40 hover:text-worktree-sidebar-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {expanded ? (
        <div className="ml-[13px] flex flex-col gap-0.5 border-l border-worktree-sidebar-foreground/10 pl-1.5">
          <OverviewRow active={activeOverview} onOpenOverview={onOverview} />
          <WorkflowRow
            version={entry.version}
            workflow="plan"
            worktrees={worktrees}
            busy={busy}
            active={activeWorkflow === 'plan'}
            onNavigate={() => onNavigateWorkflow('plan')}
            onPrepare={onPrepare}
          />
          <TasksRow busy={busy} active={activeTasks} onOpenTasks={() => onOpenTasks()} />
          {entry.goals.map((goal, index) => {
            const label = goalOrdinal(index)
            return (
              <GoalDirectoryRow
                key={goal.goalId}
                version={entry.version}
                label={label}
                title={goal.title}
                goalTrees={goalDirectoryTrees(worktrees, entry.version, goal.goalId)}
                busy={busy}
                active={activeGoalId === goal.goalId}
                onOpenTasks={() => onOpenTasks({ goalId: goal.goalId, label })}
                onPrepareStart={() =>
                  onStartGoal({ goalId: goal.goalId, label, title: goal.title })
                }
                onOpenWorkspace={() =>
                  onOpenGoalWorkspace({ goalId: goal.goalId, label, title: goal.title })
                }
              />
            )
          })}
          {entry.goals.length === 0 ? (
            <p className="px-1 py-0.5 text-[10.5px] text-worktree-sidebar-foreground/40">
              目标来自本版计划
            </p>
          ) : null}
          <WorkflowRow
            version={entry.version}
            workflow="acceptance"
            worktrees={worktrees}
            busy={busy}
            active={activeWorkflow === 'acceptance'}
            onNavigate={() => onNavigateWorkflow('acceptance')}
            onPrepare={onPrepare}
          />
        </div>
      ) : null}
    </div>
  )
}
