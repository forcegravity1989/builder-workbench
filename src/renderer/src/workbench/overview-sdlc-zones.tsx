import { useMemo, useRef } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { MetricRange } from '../../../shared/workbench/metrics'
import { addCalendarDays, dayInTimezone } from '../../../shared/workbench/metric-windows'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { MetricLineChart } from './overview-metric-chart'
import { bucketCommitCounts, type SdlcCommits, type SdlcSeries } from './overview-sdlc'
import { useOverviewSdlc } from './use-overview-sdlc'
import { zoneBucketLabels, zoneChartRange } from './overview-zone-series'
import { OverviewGrain } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'

function evidence<T>(state: SdlcSeries<T> | null): T | undefined {
  return state?.kind === 'ready' ? state.value : state?.previous
}
function counts(state: SdlcSeries<SdlcCommits> | null, range: MetricRange): (number | null)[] {
  const value = evidence(state)
  return value
    ? bucketCommitCounts(
        value.items.filter((item) => (item.timestamp ?? Infinity) <= Date.parse(value.readAt)),
        range,
        range.timezone,
        value.hasMore
      ).counts.map((count, index) => {
        const start = addCalendarDays(range.since, index * (range.granularity === 'week' ? 7 : 1))
        return start > dayInTimezone(value.readAt, range.timezone) ||
          (value.since && start < value.since)
          ? null
          : count
      })
    : zoneBucketLabels(range).map(() => null)
}
function SdlcSource({
  name,
  detail,
  data
}: {
  name: string
  detail: string
  data: SdlcSeries<{ readAt: string; source?: string }> | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const value = evidence(data)
  return (
    <>
      <button
        type="button"
        className="wb-sdlc-name"
        title="查看数据来源"
        onClick={() => dialog.current?.showModal()}
      >
        {name}
      </button>
      <dialog ref={dialog} className="wb-ov-source" aria-label={`${name}数据来源`}>
        <h2>{name}</h2>
        <p>{detail}</p>
        {value && (
          <>
            <p>{value.source}</p>
            <p>截至 {value.readAt}</p>
          </>
        )}
        {data?.kind === 'error' && <p role="alert">{data.message}</p>}
        {!data && <p>未读取</p>}
        <button
          type="button"
          className="wb-btn wb-btn-secondary"
          onClick={() => dialog.current?.close()}
        >
          关闭
        </button>
      </dialog>
    </>
  )
}

export function OverviewSdlcZones({
  identity,
  repo,
  baseScope,
  baseWorktreeId,
  baseWorktreePath,
  timezone,
  ready,
  refreshToken
}: {
  identity: string
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
  timezone?: string
  ready: boolean
  refreshToken: number
}) {
  const [view, setView] = useOverviewViewState(identity)
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const state = useOverviewSdlc({
    repo,
    baseScope,
    baseWorktreeId,
    baseWorktreePath,
    timezone: tz,
    ready,
    refreshToken
  })
  const range = useMemo(
    () => zoneChartRange(view.repoGranularity, tz, state.anchor),
    [view.repoGranularity, tz, state.anchor]
  )
  const labels = useMemo(() => zoneBucketLabels(range), [range])
  const commits = counts(state.commits, range)
  const merges = counts(state.merges, range)
  const issueEvidence = evidence(state.issues)
  const issues = labels.map((_, index) => {
    if (!issueEvidence || issueEvidence.truncated) {
      return null
    }
    const start = addCalendarDays(range.since, index * (range.granularity === 'week' ? 7 : 1))
    const end = addCalendarDays(start, range.granularity === 'week' ? 7 : 1)
    const date = dayInTimezone(issueEvidence.readAt, tz)
    return date >= start && date < end ? issueEvidence.count : null
  })
  const period = labels.at(-1) ?? '—'
  const cells = [
    {
      name: '提交',
      period,
      values: commits,
      data: state.commits,
      color: 'var(--color-accent)',
      detail: '按主工作树可达提交的提交时间统计'
    },
    {
      name: state.provider === 'codehub' ? '合入 MR' : '合入 PR',
      period,
      values: merges,
      data: state.merges,
      color: 'var(--color-accent-2)',
      detail: '按实际合入时间统计'
    },
    {
      name: '开放 Issue',
      period: issueEvidence ? dayInTimezone(issueEvidence.readAt, tz) : '未采集',
      values: issues,
      data: state.issues,
      color: 'var(--color-success)',
      detail: '仅有当前快照，历史留空'
    }
  ]
  return (
    <section className="card wb-ov-section" id="sdlc-zones" aria-label="项目指标">
      <header className="wb-ov-section-head">
        <h2>项目指标</h2>
        <div className="wb-ov-tools">
          <OverviewGrain
            label="项目指标粒度"
            value={view.repoGranularity}
            onChange={(value) => {
              setView({ repoGranularity: value })
            }}
          />
        </div>
      </header>
      <div className="wb-sdlc-grid">
        {cells.map((cell) => (
          <article className="wb-sdlc-cell" key={cell.name}>
            <div className="wb-sdlc-head">
              <SdlcSource name={cell.name} detail={cell.detail} data={cell.data} />
              <span className="wb-muted">{cell.period}</span>
              <strong className="wb-sdlc-val">{cell.values.at(-1) ?? '—'}</strong>
            </div>
            {cell.data?.kind === 'error' && (
              <p className="wb-muted" role="alert">
                {cell.data.message}
                {cell.data.previous ? '（保留上次采集数据，详见来源）' : ''}
              </p>
            )}
            <MetricLineChart
              integer
              labels={labels}
              series={[
                {
                  name: cell.name,
                  values: cell.values,
                  color: cell.color,
                  unit: '',
                  solid: true,
                  on: true
                }
              ]}
              emptyText={
                state.busy ? '读取中…' : cell.data?.kind === 'error' ? '读取失败' : '暂无读数'
              }
              hiddenText="未选择指标"
              ariaLabel={`${cell.name}趋势`}
            />
          </article>
        ))}
      </div>
    </section>
  )
}
