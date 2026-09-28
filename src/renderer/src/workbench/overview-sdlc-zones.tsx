import { useMemo, useRef, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { MetricRange } from '../../../shared/workbench/metrics'
import { addCalendarDays, dayInTimezone } from '../../../shared/workbench/metric-windows'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { MetricLineChart } from './overview-metric-chart'
import { bucketCommitCounts, type SdlcCommits, type SdlcSeries } from './overview-sdlc'
import { useOverviewSdlc } from './use-overview-sdlc'
import { zoneBucketLabels, zoneChartRange } from './overview-zone-series'
import { OverviewGrain, OverviewRefresh } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'

function counts(state: SdlcSeries<SdlcCommits> | null, range: MetricRange): (number | null)[] {
  return state?.kind === 'ready'
    ? bucketCommitCounts(
        state.value.items.filter(
          (item) => (item.timestamp ?? Infinity) <= Date.parse(state.value.readAt)
        ),
        range,
        range.timezone,
        state.value.hasMore
      ).counts
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
        {data?.kind === 'ready' && (
          <>
            <p>{data.value.source}</p>
            <p>截至 {data.value.readAt}</p>
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
  timezone
}: {
  identity: string
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
  timezone?: string
}) {
  const [view, setView] = useOverviewViewState(identity)
  const [anchor, setAnchor] = useState(() => new Date().toISOString())
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const range = useMemo(
    () => zoneChartRange(view.repoGranularity, tz, anchor),
    [view.repoGranularity, tz, anchor]
  )
  const labels = useMemo(() => zoneBucketLabels(range), [range])
  const state = useOverviewSdlc({ repo, baseScope, baseWorktreeId, baseWorktreePath, range })
  const commits = counts(state.commits, range)
  const merges = counts(state.merges, range)
  const issues = labels.map((_, index) => {
    if (state.issues?.kind !== 'ready' || state.issues.value.truncated) {
      return null
    }
    const start = addCalendarDays(range.since, index * (range.granularity === 'week' ? 7 : 1))
    const end = addCalendarDays(start, range.granularity === 'week' ? 7 : 1)
    const date = dayInTimezone(state.issues.value.readAt, tz)
    return date >= start && date < end ? state.issues.value.count : null
  })
  const period = view.repoGranularity === 'week' ? '本周' : '今日'
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
      period: '当前',
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
            onChange={(value) => setView({ repoGranularity: value })}
          />
          <OverviewRefresh
            label="刷新项目指标"
            busy={state.busy}
            onClick={() => setAnchor(new Date().toISOString())}
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
