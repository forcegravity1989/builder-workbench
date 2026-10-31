import { useState } from 'react'
import { CalendarDays, ClipboardCheck, ListTodo, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { useVersionCatalogForRepo } from './use-version-catalog'
import type { VersionOverviewMaterials } from './version-overview-materials'
import { navigateVersionWorkflow, openVersionTasks } from './version-nav-actions'
import { openVersionOverview, type VersionOverviewOptions } from './project-page-state'
import type { VersionGoal } from '../../../shared/workbench/version-material'
import { DECISION_LABELS, goalOrdinal } from './version-labels'
import { FeatureCard } from './version-overview/feature-card'
import { useVersionFacts } from './version-overview/use-version-facts'
import { useMilestoneSource } from './use-milestone-source'
import { milestoneStageHours, type MilestoneVersionFacts } from './milestone-feature-facts'
import { taskKey, validTime } from './version-overview/feature-model'
import { openEvidenceUrl, timeLabel } from './version-overview/overview-time'
import { WorkflowProductivity } from './version-overview/workflow-productivity'
import './version-overview/overview.css'

function ArchiveTime({
  kind,
  materials
}: {
  kind: 'plan' | 'acceptance'
  materials: VersionOverviewMaterials
}) {
  const status = materials.prStatuses[kind]
  const document = materials[kind]
  const reference = document.kind === 'ready' ? document.document.workflow?.archivePr : null
  const label = kind === 'plan' ? '计划 PR 合入' : '验收 PR 合入'
  const at = status?.state === 'merged' && validTime(status.mergedAt) ? status.mergedAt : undefined
  const missing =
    document.kind === 'error' || status?.state === 'unknown'
      ? '未知'
      : document.kind === 'loading' || (reference && !status)
        ? '读取中'
        : status && status.state !== 'merged'
          ? '未合入'
          : '未记录'
  return (
    <span title={status?.state === 'unknown' ? status.reason : '北京时间 UTC+08:00'}>
      {label} · {at ? <time dateTime={at}>{timeLabel(at)}</time> : missing}
      {status && 'url' in status && status.url && (
        <button className="bwo-link ml-1" onClick={() => openEvidenceUrl(status.url!)}>
          #{reference?.number} ↗
        </button>
      )}
    </span>
  )
}

export function VersionOverviewPage({ options }: { options: VersionOverviewOptions }) {
  const { repoId, version } = options
  const catalog = useVersionCatalogForRepo(repoId)
  const [refreshToken, setRefreshToken] = useState(0)
  const [focus, setFocus] = useState<string | null>(null)
  const { materials, features } = useVersionFacts(catalog, version, refreshToken)
  const milestoneSource = useMilestoneSource(catalog, refreshToken)
  const { plan, acceptance } = materials
  const planDocument = plan.kind === 'ready' ? plan.document : null
  const acceptanceDocument = acceptance.kind === 'ready' ? acceptance.document : null
  const planUnstarted =
    plan.kind === 'missing' ||
    Boolean(
      plan.kind === 'ready' &&
      plan.source === 'draft' &&
      planDocument &&
      !planDocument.goals.length &&
      !planDocument.tasks.length &&
      !planDocument.workflow &&
      !planDocument.minutes &&
      !planDocument.summary.progress.trim() &&
      !planDocument.summary.risks.trim()
    )
  const entry = catalog.catalog?.entries.find((e) => e.version === version) ?? null
  const projectName = useAppStore(
    (state) => state.repos.find((repo) => repo.id === repoId)?.displayName ?? '项目'
  )
  const workflow = (kind: 'plan' | 'acceptance') =>
    navigateVersionWorkflow({ catalog, version, workflow: kind, projectKey: repoId })
  const tasks = (goal?: VersionGoal) =>
    void openVersionTasks({
      catalog,
      version,
      entry,
      goal: goal ? { goalId: goal.goalId, label: goal.title } : null
    })
  const materialErrors = [
    ...new Set([
      ...(materials.problems ?? []),
      ...[plan, acceptance].flatMap((doc) => (doc.kind === 'error' ? [doc.message] : []))
    ])
  ]
  const planningFailed = Boolean(milestoneSource.error || milestoneSource.formal?.problems.length)
  const milestoneFacts: MilestoneVersionFacts = {
    plan: planDocument,
    features: features.features,
    loading: features.loading,
    failed: Boolean(materialErrors.length || features.problems.length),
    stale:
      (!materialErrors.length || materials.stale === true) &&
      (!features.problems.length || features.stale === true)
  }
  const status =
    materialErrors.length > 0
      ? '状态未知'
      : plan.kind === 'loading' || acceptance.kind === 'loading'
        ? '读取中'
        : acceptance.kind === 'ready' && acceptance.source === 'committed'
          ? '已有正式验收'
          : planUnstarted
            ? '计划未制定'
            : plan.kind === 'ready' && plan.source === 'draft'
              ? '计划草稿'
              : '版本中'
  const refresh = () => {
    setRefreshToken((n) => n + 1)
    catalog.reload()
  }
  return (
    <main className="bwo-page scrollbar-sleek">
      <div className="mb-6 text-xs text-muted-foreground">
        {projectName} <span className="mx-2">›</span> {version} <span className="mx-2">›</span> 总览
      </div>
      <header className="bwo-header">
        <h1>{version} 版本总览</h1>
        <span className="bwo-badge">{status}</span>
        <div className="ml-auto flex gap-1">
          {[
            { label: '版本计划', Icon: CalendarDays, action: () => workflow('plan') },
            { label: '版本任务', Icon: ListTodo, action: () => tasks() },
            { label: '版本验收', Icon: ClipboardCheck, action: () => workflow('acceptance') },
            {
              label: '刷新来源',
              Icon: RefreshCw,
              action: refresh,
              busy: features.loading || catalog.loading || materials.refreshing
            }
          ].map(({ label, Icon, action, busy }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={label} onClick={action}>
                  <Icon className={busy ? 'animate-spin' : undefined} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </header>
      <div className="bwo-meta">
        <span>
          负责人 ·{' '}
          {[
            ...new Set(
              planDocument?.goals
                .flatMap((g) => (g.owner ?? '').split(/[;；、]/).map((owner) => owner.trim()))
                .filter(Boolean)
            )
          ].join('、') || '未记录'}
        </span>
        <ArchiveTime kind="plan" materials={materials} />
        <ArchiveTime kind="acceptance" materials={materials} />
      </div>
      {materialErrors.map((error) => (
        <p className="mb-4 text-sm text-destructive" role="alert" key={error}>
          {error}{' '}
          <button className="bwo-link" onClick={refresh}>
            重试
          </button>
        </p>
      ))}
      {materialErrors.length > 0 && materials.readAt && (
        <p className="bwo-muted">可读内容保留至上次来源快照：{timeLabel(materials.readAt)}</p>
      )}
      {plan.kind === 'loading' && (
        <p className="bwo-muted" role="status">
          正在读取版本材料…
        </p>
      )}
      {planUnstarted && (
        <div className="bwo-empty">
          <h2>先明确这一版要交付什么</h2>
          <Button onClick={() => workflow('plan')}>开始制定版本计划</Button>
        </div>
      )}
      {planDocument?.goals.map((goal, index) => {
        const references = planDocument.tasks.filter((task) => task.goalId === goal.goalId)
        const grouped = features.features.filter((feature) =>
          feature.members.some((member) => member.reference.goalId === goal.goalId)
        )
        const result = acceptanceDocument?.results.find((row) => row.goalId === goal.goalId)
        return (
          <section key={goal.goalId} className="bwo-goal">
            <div className="bwo-goal-heading">
              <span className="bwo-muted">{goalOrdinal(index)}</span>
              <h2>{goal.title}</h2>
              <div className="bwo-goal-meta">
                <span>负责人 · {goal.owner || '未记录'}</span>
                <button className="bwo-link" onClick={() => tasks(goal)}>
                  目标任务 · {references.length} 项 ↗
                </button>
              </div>
              <button
                className="bwo-badge"
                onClick={() => workflow('acceptance')}
                title={result?.decision?.reason ?? result?.note ?? '打开本版验收记录'}
              >
                {result?.decision
                  ? DECISION_LABELS[result.decision.outcome]
                  : acceptance.kind === 'error'
                    ? '验收未知'
                    : '未记录验收'}{' '}
                ↗
              </button>
            </div>
            {grouped.map((feature) => (
              <div
                key={taskKey(feature.root.reference)}
                ref={(node) => {
                  if (node && focus === feature.root.url) {
                    node.scrollIntoView({ block: 'center' })
                    setFocus(null)
                  }
                }}
              >
                <FeatureCard
                  plannedHours={milestoneStageHours(
                    milestoneSource.formal?.problems.length
                      ? undefined
                      : milestoneSource.formal?.material,
                    milestoneFacts,
                    feature
                  )}
                  planningFailed={planningFailed}
                  feature={feature}
                  version={version}
                  historical={acceptance.kind === 'ready' && acceptance.source === 'committed'}
                  onVersion={(next, id) => {
                    setFocus(id)
                    openVersionOverview({ repoId, version: next })
                  }}
                />
              </div>
            ))}
            {features.loading && <p className="bwo-muted">正在读取特性与关联成果…</p>}
          </section>
        )
      })}
      {planDocument && planDocument.tasks.some((task) => !task.goalId) && (
        <p className="bwo-muted py-4">
          未关联目标 · {planDocument.tasks.filter((task) => !task.goalId).length} 项{' '}
          <button className="bwo-link" onClick={() => tasks()}>
            查看版本任务 ↗
          </button>
        </p>
      )}
      {features.problems.length > 0 && (
        <details className="bwo-muted">
          <summary>部分任务或特性来源未读取（{features.problems.length}）</summary>
          {features.problems.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </details>
      )}
      {features.stale && features.readAt && (
        <p className="bwo-muted">特性来源刷新失败，保留上次快照：{timeLabel(features.readAt)}</p>
      )}
      <WorkflowProductivity
        catalog={catalog}
        plan={planDocument}
        version={version}
        revision={plan.kind === 'ready' ? (plan.sourceCommit ?? plan.revision) : undefined}
        planState={plan.kind}
        sourceReady={Boolean(features.readAt) || !features.loading}
      />
    </main>
  )
}
