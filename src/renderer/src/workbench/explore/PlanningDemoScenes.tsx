import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'
import { PlanningArchiveCard } from '../version-planning/PlanningArchiveCard'
import { PlanningGoalCard } from '../version-planning/PlanningGoalCard'
import { PlanningMinutesSection } from '../version-planning/PlanningMinutesSection'
import { PlanningPriorReview } from '../version-planning/PlanningPriorReview'
import { PlanningStartCard } from '../version-planning/PlanningStartCard'
import { NewWorkspaceComposerFooter } from '@/components/new-workspace/NewWorkspaceComposerFooter'
import { Input } from '@/components/ui/input'
import { BoardActionButton } from '../board-ui'
import { CalendarRange, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { sampleCharter } from './DirectionCharterDemo'
import '../version-planning/version-planning.css'
import './planning-walkthrough.css'

const ignore = () => {}
const noNumbers = () => []
const noTaskAction = async () => {}
const passthrough: Parameters<typeof PlanningMinutesSection>[0]['onSendAction'] = (
  _request,
  _label,
  button
) => button
const version = 'v0.2'
const issueTitle = '实现首场交换预约'
const goal: VersionGoal = {
  goalId: 'booking',
  title: '让邻居用手机预约首场交换',
  acceptance: '能选择场次并看到预约确认。',
  owner: sampleCharter.owner,
  metricTargets: []
}
const plan: PlanningMaterial = {
  schema_version: 3,
  version,
  cycleId: 'book-exchange-demo',
  summary: { progress: '', risks: '' },
  goals: [goal],
  tasks: []
}
const reference = {
  provider: 'github',
  repository: 'github.com/example/book-exchange',
  number: 12,
  goalId: goal.goalId
}
const reads = new Map<string, CycleTaskRead>([
  [
    `${reference.provider}:${reference.repository}:${reference.number}`,
    {
      kind: 'ready',
      reference,
      task: {
        reference,
        source: {
          kind: 'task-source',
          provider: 'github',
          projectId: 'book-exchange-demo',
          hostId: 'local'
        },
        iid: reference.number,
        title: issueTitle,
        state: 'open',
        url: 'https://example.invalid/book-exchange/issues/12',
        readAt: '2026-11-13T00:00:00Z'
      }
    }
  ]
])
const archivePr = { provider: 'github', repository: reference.repository, number: 15 } as const
const checkedAt = '2026-11-13T00:00:00Z'
const priorSource = {
  version: 'v0.1',
  cycleId: 'book-exchange-first-demo',
  sourceCommit: '1'.repeat(40),
  revision: `sha256:${'1'.repeat(64)}`
}

function SampleHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="planning-demo-header">
      <div>
        <small>
          {sampleCharter.name} / {version}
        </small>
        <h4>版本计划</h4>
      </div>
      {children}
    </header>
  )
}

export function PlanningEntryDemo({ time }: { time: number }) {
  if (time < 1700) {
    return (
      <section className="direction-demo-focus planning-demo-composer">
        <div className="flex items-center justify-between">
          <h4>{sampleCharter.name} · 版本</h4>
          <BoardActionButton aria-label="新建版本">
            <Plus size={14} />
          </BoardActionButton>
        </div>
        <div className="flex items-center justify-between rounded border border-border p-2">
          <strong>{version}</strong>
          <BoardActionButton data-demo-action="open-plan">
            <CalendarRange size={14} /> 计划
          </BoardActionButton>
        </div>
      </section>
    )
  }
  return (
    <div className="direction-demo-window planning-demo">
      <SampleHeader />
      {time < 3900 ? (
        <PlanningStartCard version={version} busy={false} onStart={ignore} />
      ) : (
        <PlanningPriorReview
          source={priorSource}
          state={{
            kind: 'ready',
            source: priorSource,
            carryovers: {
              issues: [],
              directives: [{ label: 'M1', text: '首场交换前开放手机预约' }],
              issueMarksRecorded: true,
              openReadbackReferences: []
            }
          }}
          live={{ kind: 'idle' }}
          openingSource={false}
          onOpenAcceptance={ignore}
          onOpenTask={noTaskAction}
          onRetryLive={ignore}
          sectionRef={null}
        />
      )}
    </div>
  )
}

function GoalFrame({
  value = goal,
  editing = false,
  showIssue = false,
  taskOnly = false
}: {
  value?: VersionGoal
  editing?: boolean
  showIssue?: boolean
  taskOnly?: boolean
}) {
  return (
    <div className={taskOnly ? 'planning-demo-task-focus' : undefined}>
      <PlanningGoalCard
        goal={value}
        index={0}
        relatedTasks={showIssue ? [reference] : []}
        issueMembershipKnown
        reads={showIssue ? reads : null}
        version={version}
        onChange={ignore}
        onRemove={ignore}
        onTask={noTaskAction}
        onSendAction={passthrough}
        metrics={{
          catalog: null,
          values: {},
          readings: {},
          error: null,
          reloadCatalog: noTaskAction,
          refresh: noTaskAction
        }}
        expanded
        expandedSignal={0}
        viewStateKey={undefined}
        editing={editing}
        onEditingChange={ignore}
        numbersFor={noNumbers}
        onOpenAnnotationPanel={ignore}
      />
    </div>
  )
}

export function PlanningGoalDemo({ time }: { time: number }) {
  const editing = time >= 1100 && time < 4800
  const entered = Math.max(0, Math.floor((time - 2100) / 95))
  return (
    <div className="direction-demo-window planning-demo">
      <SampleHeader>
        <span>{editing ? '正在保存修改…' : '已保存'}</span>
      </SampleHeader>
      <GoalFrame
        value={{
          ...goal,
          acceptance: time >= 4800 ? goal.acceptance : goal.acceptance?.slice(0, entered)
        }}
        editing={editing}
      />
    </div>
  )
}

export function PlanningTasksDemo({ time }: { time: number }) {
  return (
    <div className="direction-demo-window planning-demo">
      <SampleHeader />
      <GoalFrame showIssue={time >= 2800} taskOnly />
    </div>
  )
}

export function PlanningReviewDemo({ time }: { time: number }) {
  const confirmed = time >= 2500
  const merged = time >= 6900
  if (time < 4200) {
    return (
      <div className="direction-demo-window planning-demo">
        <SampleHeader />
        <PlanningMinutesSection
          plan={{
            ...plan,
            minutes: { consensus: ['首场交换支持手机预约'], followups: [], confirmed }
          }}
          disabled={false}
          edit={ignore}
          onSendAction={passthrough}
          sectionRef={null}
        />
      </div>
    )
  }
  return (
    <div className="direction-demo-window planning-demo">
      <SampleHeader />
      <PlanningArchiveCard
        archivePr={archivePr}
        reachedArchive
        status={{ state: merged ? 'merged' : 'open', checkedAt }}
        loading={false}
        opening={false}
        onOpenPr={ignore}
        sectionRef={null}
      />
    </div>
  )
}

export function PlanningStartIssueDemo({ time }: { time: number }) {
  if (time >= 5250) {
    return (
      <div className="direction-demo-window planning-demo">
        <section className="rounded-md border border-border bg-muted p-4 text-sm">
          <strong>#12 {issueTitle}</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            {sampleCharter.name} / {version} / G1
          </p>
          <div className="mt-3 border-t border-border pt-3">工作区 · 终端</div>
        </section>
      </div>
    )
  }
  if (time < 2300) {
    return (
      <div className="direction-demo-window planning-demo">
        <SampleHeader />
        <GoalFrame showIssue taskOnly />
      </div>
    )
  }
  return (
    <div className="direction-demo-focus planning-demo-composer">
      <h4>新工作区</h4>
      <p>
        {sampleCharter.name} · {version}
      </p>
      <label>
        <span>名称</span>
        <Input readOnly value={`#12 ${issueTitle}`} />
      </label>
      <NewWorkspaceComposerFooter
        createError={null}
        createDisabled={false}
        creating={false}
        onCreate={ignore}
        primaryActionLabel="创建 worktree"
        submitShortcutModifierLabel="Ctrl"
      />
    </div>
  )
}
