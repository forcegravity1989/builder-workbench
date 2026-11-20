import type { ReactNode } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/monica/version-material'
import type { ArchivePrStatusResult } from '../../../../shared/monica/archive-pr-status'
import { Button } from '@/components/ui/button'
import { AcceptanceArchiveCard } from '../version-acceptance/AcceptanceArchiveCard'
import { AcceptanceGoalRow } from '../version-acceptance/AcceptanceGoalRow'
import { AcceptanceMinutesSection } from '../version-acceptance/AcceptanceMinutesSection'
import { AcceptanceEvidenceReportRow } from '../version-acceptance/AcceptancePrepareSection'
import { versionWorkflowProgress } from '../version-workflow-progress'
import { DECISION_LABELS } from '../version-labels'
import type { CycleTaskRead } from '../version-cycle/ports'
import { sampleCharter } from './DirectionCharterDemo'
import '../version-acceptance/acceptance.css'
import '../version-overview/overview.css'

const ignore = () => {}
const passthrough: Parameters<typeof AcceptanceArchiveCard>[0]['onSendAction'] = (
  _request,
  _label,
  button,
  _actionId
) => button
const version = 'v0.2'
const repository = 'example.invalid/book-exchange'
const at = '2026-11-15T10:00:00Z'
const commit = 'a'.repeat(40)
const revision = `sha256:${'b'.repeat(64)}`
const goal = {
  goalId: 'booking',
  title: '让邻居用手机预约首场交换',
  acceptance: '能选择场次并看到预约确认。',
  owner: sampleCharter.owner,
  metricTargets: []
}
const reference = { provider: 'github', repository, number: 12, goalId: goal.goalId } as const
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
        title: '实现首场交换预约',
        state: 'closed',
        url: 'https://example.invalid/book-exchange/issues/12',
        readAt: at
      }
    }
  ]
])
const plan: PlanningMaterial = {
  schema_version: 3,
  version,
  cycleId: 'book-exchange-demo',
  summary: { progress: '', risks: '' },
  goals: [goal],
  tasks: [reference]
}
const report = {
  artifactId: 'evidence-demo',
  kind: 'verification',
  location: '.bw/planning/v0.2/acceptance-evidence.html',
  candidateRef: { repository, version, commit },
  generatedAt: at
} as const
const archivePr = { provider: 'github', repository, number: 21 } as const
const nextStep = '修正场次确认信息，补上窄屏复验。'
const acceptance: AcceptanceMaterial = {
  schema_version: 3,
  version,
  cycleId: 'book-exchange-acceptance-demo',
  planRef: { kind: 'committed', version, cycleId: plan.cycleId, sourceCommit: commit, revision },
  results: [],
  preparedArtifacts: [report]
}
const decided: AcceptanceMaterial = {
  ...acceptance,
  results: [
    {
      goalId: goal.goalId,
      readings: [],
      note: '',
      nextStep,
      decision: {
        outcome: 'not-met',
        recordedAt: at,
        source: '样例人工验收',
        materialRevision: revision,
        reason: '样例复验发现切换场次后仍显示上一场'
      }
    }
  ]
}

function Scene({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="direction-demo-window p-4">
      <div className="mx-auto w-full max-w-xl">
        <p className="mb-1 text-xs text-muted-foreground">
          {sampleCharter.name} / {version}
        </p>
        {title && <h4 className="mb-3 text-sm font-semibold">{title}</h4>}
        {children}
      </div>
    </div>
  )
}

export function AcceptanceEvidenceDemo({ time }: { time: number }) {
  if (time < 1900) {
    return (
      <Scene title="版本验收">
        <div className="acc-empty-board">
          <p>版本验收尚未开始</p>
          <button type="button" data-demo-action="start-acceptance">
            开始验收
          </button>
        </div>
      </Scene>
    )
  }
  return (
    <Scene title="验收准备">
      <AcceptanceEvidenceReportRow
        report={time >= 4550 ? report : undefined}
        onSendAction={passthrough}
        onOpenMaterial={ignore}
      />
      {time >= 6900 ? (
        <div className="direction-demo-focus mt-3 space-y-2 rounded-md border border-border p-3 text-xs">
          <p className="font-semibold">验收证据报告 · G1 · 样例 Issue #12</p>
          <p>首场预约显示所选场次和确认信息。</p>
          <p>复验结果 · 切换场次后，确认信息仍显示上一场。</p>
          <p>待核对 · 窄屏场景的复验尚无记录。</p>
        </div>
      ) : time < 4550 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {time >= 3290 ? '样例会话 · 聚合本次验收的证据报告。' : '本版正式计划已读入。'}
        </p>
      ) : null}
    </Scene>
  )
}

export function AcceptanceDecisionDemo({ time }: { time: number }) {
  const document =
    time < 4550
      ? acceptance
      : time < 5900
        ? { ...decided, results: decided.results.map((result) => ({ ...result, nextStep: '' })) }
        : decided
  return (
    <Scene title="Showcase">
      <AcceptanceGoalRow
        goal={goal}
        index={0}
        plan={plan}
        document={document}
        disabled={false}
        relatedTasks={[reference]}
        issueMembershipKnown
        reads={reads}
        onTask={async () => {}}
        onGoalChange={ignore}
        numbersFor={() => []}
        onOpenAnnotationPanel={ignore}
        expanded={time >= 1600}
        expandedSignal={0}
        viewStateKey={undefined}
      />
    </Scene>
  )
}

export function AcceptanceMinutesDemo({ time }: { time: number }) {
  return (
    <Scene>
      <AcceptanceMinutesSection
        document={{
          ...decided,
          minutes: {
            consensus: ['G1 · 复验时换一个场次，核对确认信息。'],
            followups: [{ id: 'followup-demo', text: `G1 · ${nextStep} 跟进样例 Issue #22。` }],
            confirmed: time >= 2300
          }
        }}
        goals={plan.goals}
        disabled={false}
        edit={ignore}
        onSendAction={passthrough}
        sectionRef={null}
      />
    </Scene>
  )
}

export function AcceptanceArchiveDemo({ time }: { time: number }) {
  return (
    <Scene>
      <AcceptanceArchiveCard
        archivePr={time >= 2700 ? archivePr : undefined}
        reachedArchive={time >= 2700}
        status={{ state: 'open', checkedAt: at }}
        loading={false}
        opening={false}
        onOpenPr={ignore}
        onSendAction={passthrough}
        release={undefined}
        releaseStatus={null}
        releaseLoading={false}
        onOpenRelease={ignore}
        version={version}
        sectionRef={null}
      />
      {time >= 5100 && (
        <p className="mt-2 text-xs text-muted-foreground">样例 PR #21 · 人在原生 PR 页核对材料。</p>
      )}
    </Scene>
  )
}

export function AcceptanceReadbackDemo({ time }: { time: number }) {
  const refreshed = time >= 1800
  const status: ArchivePrStatusResult = refreshed
    ? { state: 'merged', checkedAt: at, mergedAt: at }
    : { state: 'open', checkedAt: at }
  const { label, archive } = versionWorkflowProgress(
    {
      kind: 'ready',
      source: refreshed ? 'committed' : 'draft',
      document: { workflow: { stage: 'archive', updatedAt: at, archivePr } }
    },
    status
  )
  return (
    <Scene title={`${version} 版本总览`}>
      <div className="bwo-header">
        <span className="bwo-badge">{refreshed ? '已有正式验收' : '版本中'}</span>
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          data-demo-action="refresh-acceptance"
        >
          刷新来源
        </Button>
      </div>
      <div className="bwo-meta">
        验收 · {label} · {archive?.label} · #21
      </div>
      <div className="bwo-goal">
        <div className="bwo-goal-heading">
          <span>G1</span>
          <h4>{goal.title}</h4>
          <span className="bwo-badge">{DECISION_LABELS['not-met']}</span>
        </div>
      </div>
      {refreshed && (
        <p className="mt-3 text-xs text-muted-foreground">
          下版计划可回看会议遗留，由人决定是否带入。
        </p>
      )}
    </Scene>
  )
}
