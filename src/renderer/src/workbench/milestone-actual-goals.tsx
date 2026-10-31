import { useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { actualDay } from '../../../shared/workbench/milestone-sdlc'
import type { VersionCatalogState } from './use-version-catalog'
import { useVersionFacts } from './version-overview/use-version-facts'
import { featureTimeline } from './version-overview/feature-timeline'
import { taskKey } from './version-overview/feature-model'
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

/** Actual rows use explicit Issue identity. Macro planning names never serve as bindings. */
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
  const rows =
    identityMatches && plan
      ? features.features
          .map((feature) => ({
            feature,
            goals: plan.goals.flatMap((goal, index) =>
              feature.members.some((member) => member.reference.goalId === goal.goalId)
                ? [{ goal, index }]
                : []
            )
          }))
          .filter((row) => row.goals.length > 0)
      : []
  const times = rows.flatMap(({ feature }) =>
    featureTimeline(feature).segments.flatMap((stage) =>
      stage.duration !== null && stage.start && stage.end
        ? [actualDay(stage.start), actualDay(stage.end)]
        : []
    )
  )
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
      {features.loading && !rows.length && (
        <div className="wb-ml-actual-notice" role="status">
          {version.version}：正在读取特性依据…
        </div>
      )}
      {rows.map(({ feature, goals }) => {
        const timeline = featureTimeline(feature)
        const goalLabels = goals.map(({ index }) => goalOrdinal(index)).join('、')
        const acceptance = goals
          .map(({ goal, index }) => {
            const result =
              materials.acceptance.kind === 'ready'
                ? materials.acceptance.document.results.find(
                    (entry) => entry.goalId === goal.goalId
                  )?.decision
                : null
            return `${goalOrdinal(index)} · ${result ? DECISION_LABELS[result.outcome] : '未记录验收'}`
          })
          .join('；')
        return (
          <div
            className="wb-ml-row wb-ml-actual-row"
            key={taskKey(feature.root.reference)}
            data-actual-goal={`${version.cycleId}:${goals[0].goal.goalId}`}
            data-actual-feature={taskKey(feature.root.reference)}
          >
            <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
              <div>
                <strong title={feature.root.title}>
                  {version.version} · {goalLabels} · #{feature.root.iid} · {feature.root.title}
                </strong>
                <small>
                  {feature.root.assignee || '负责人未记录'} · {acceptance}
                </small>
                <small>实际 · Deploy 未跟踪</small>
                {features.loading && <small>正在刷新</small>}
              </div>
            </div>
            <div className="wb-ml-track" style={{ width: canvasWidth }}>
              {timeline.segments.map((stage) => {
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
                        style={{ left: x, width: Math.max(1, pixels), top: 31 }}
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
              {!timeline.segments.some((s) => s.duration !== null) && (
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
