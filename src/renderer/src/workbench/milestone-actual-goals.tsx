import { useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { actualDay } from '../../../shared/workbench/milestone-sdlc'
import type { VersionCatalogState } from './use-version-catalog'
import { useVersionFacts } from './version-overview/use-version-facts'
import { featureTimeline } from './version-overview/feature-timeline'
import { elapsedLabel, timeLabel, openEvidenceUrl } from './version-overview/overview-time'
import { goalOrdinal, DECISION_LABELS } from './version-labels'
import { MILESTONE_DAY_WIDTH } from './use-milestone-gesture'

type Props = {
  catalog: VersionCatalogState
  version: ScheduledVersion
  origin: number
  canvasWidth: number
  refreshToken: number
  reportRange(key: string, start: number | null, end: number | null): void
}

/** Actual rows are version goals. Macro planning names never serve as Issue bindings. */
export function MilestoneActualGoals({
  catalog,
  version,
  origin,
  canvasWidth,
  refreshToken,
  reportRange
}: Props) {
  const { materials, features } = useVersionFacts(catalog, version.version, refreshToken)
  const plan = materials.plan.kind === 'ready' ? materials.plan.document : null
  const identityMatches = plan?.cycleId === version.cycleId && plan.version === version.version
  const failures = [...(materials.problems ?? []), ...features.problems]
  const times = identityMatches
    ? features.features.flatMap((f) =>
        featureTimeline(f).segments.flatMap((s) =>
          s.duration !== null && s.start && s.end ? [actualDay(s.start), actualDay(s.end)] : []
        )
      )
    : []
  const start = times.length ? Math.floor(Math.min(...times)) : null
  const end = times.length ? Math.ceil(Math.max(...times)) : null
  useEffect(() => {
    reportRange(version.cycleId, start, end)
    return () => reportRange(version.cycleId, null, null)
  }, [version.cycleId, start, end, reportRange])
  if (!identityMatches || !plan) {
    const status =
      failures[0] ??
      (materials.plan.kind === 'loading'
        ? '正在读取版本计划…'
        : plan
          ? '版本身份与计划不一致'
          : '尚无版本目标')
    return (
      <div className="wb-ml-row">
        <div className="wb-ml-label wb-ml-feature">{version.version}</div>
        <div className="wb-ml-track" style={{ width: canvasWidth }}>
          <span className="wb-ml-actual-status" role="status">
            {status}
          </span>
        </div>
      </div>
    )
  }
  return (
    <>
      {plan.goals.map((goal, index) => {
        const grouped = features.features.filter((f) =>
          f.members.some((m) => m.reference.goalId === goal.goalId)
        )
        const feature = grouped.length === 1 ? grouped[0] : null
        const timeline = feature ? featureTimeline(feature) : null
        const result =
          materials.acceptance.kind === 'ready'
            ? materials.acceptance.document.results.find((r) => r.goalId === goal.goalId)?.decision
            : null
        const count = plan.tasks.filter((task) => task.goalId === goal.goalId).length
        const status =
          features.loading && !grouped.length
            ? '正在读取特性依据…'
            : grouped.length > 1
              ? `${grouped.length} 个特性，历程分别保留在版本总览`
              : !grouped.length
                ? `${count} 项任务 · 尚无可读取的特性历程`
                : null
        return (
          <div
            className="wb-ml-row wb-ml-actual-row"
            key={goal.goalId}
            data-actual-goal={`${version.cycleId}:${goal.goalId}`}
          >
            <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
              <div>
                <strong title={goal.title}>
                  {version.version} · {goalOrdinal(index)} · {goal.title}
                </strong>
                <small>
                  {goal.owner || '负责人未记录'} ·{' '}
                  {result ? DECISION_LABELS[result.outcome] : '未记录验收'}
                </small>
                {feature && <small>特性 #{feature.root.iid} · Deploy 未跟踪</small>}
                {features.loading && grouped.length > 0 && <small>正在刷新</small>}
              </div>
            </div>
            <div className="wb-ml-track" style={{ width: canvasWidth }}>
              {status && (
                <span className="wb-ml-actual-status" role="status">
                  {status}
                </span>
              )}
              {timeline?.segments.map((stage) => {
                if (stage.duration === null || !stage.start || !stage.end) {
                  return null
                }
                const x = (actualDay(stage.start) - origin) * MILESTONE_DAY_WIDTH
                const pixels = (actualDay(stage.end) - actualDay(stage.start)) * MILESTONE_DAY_WIDTH
                const sources = timeline.sources.find((s) => s.id === stage.id)?.events ?? []
                return (
                  <Tooltip key={stage.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={`wb-ml-phase wb-phase-${stage.id.toLowerCase()} wb-ml-actual-phase`}
                        data-ongoing={stage.ongoing || undefined}
                        style={{ left: x, width: Math.max(1, pixels) }}
                        aria-label={`${stage.id} · ${timeLabel(stage.start)} — ${timeLabel(stage.end)}`}
                        onClick={() => {
                          if (sources.length === 1 && sources[0].url) {
                            openEvidenceUrl(sources[0].url)
                          }
                        }}
                      >
                        {stage.id}
                        {stage.ongoing ? ' · 进行中' : ''}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {stage.id} · {stage.label}
                      <br />
                      {timeLabel(stage.start)} → {stage.ongoing ? '截至 ' : ''}
                      {timeLabel(stage.end)}
                      <br />
                      {elapsedLabel(stage.duration)}，含等待
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              {timeline && !timeline.segments.some((s) => s.duration !== null) && (
                <span className="wb-ml-actual-status">节点时间未记录</span>
              )}
            </div>
          </div>
        )
      })}
      {(failures.length > 0 || features.stale) && (
        <div className="wb-ml-actual-notice" role="alert">
          {version.version}：{[...new Set(failures)].join('；')}{' '}
          {features.readAt && `保留截至 ${timeLabel(features.readAt)} 的读数`}
        </div>
      )}
      {!plan.goals.length && (
        <div className="wb-ml-actual-notice">{version.version} 尚无版本目标</div>
      )}
    </>
  )
}

export function MilestoneActualVersions({
  versions,
  started,
  factsRefresh,
  ...props
}: Omit<Props, 'version' | 'refreshToken'> & {
  versions: ScheduledVersion[]
  started: Set<string>
  factsRefresh: number
}) {
  return versions
    .filter((v) => started.has(v.cycleId))
    .map((version) => (
      <MilestoneActualGoals
        key={version.cycleId}
        {...props}
        version={version}
        refreshToken={factsRefresh}
      />
    ))
}
