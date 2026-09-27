import { useMemo, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { MetricLineChart } from './overview-metric-chart'
import {
  bucketCommitCounts,
  SDLC_ISSUE_LIMIT,
  type SdlcSeries,
  type SdlcSnapshot
} from './overview-sdlc'
import { useOverviewSdlc } from './use-overview-sdlc'
import { zoneBucketLabels, zoneChartRange, type ZoneGranularity } from './overview-zone-series'

const SDLC_COMMIT_COLOR = 'var(--color-accent, #d97757)'

function SnapshotNote({ state }: { state: SdlcSeries<SdlcSnapshot> | null }) {
  if (state === null) {
    return <div className="wb-mz-empty">未读取</div>
  }
  if (state.kind === 'error') {
    return <div className="wb-mz-empty">未知：{state.message}</div>
  }
  return (
    <div className="wb-sdlc-snapshot">
      <p className="wb-sdlc-line">仅展示当前存量；历史存量需完整事件源，不从当前状态推造。</p>
      {state.value.truncated && (
        <p className="wb-sdlc-line">仅计入前 {SDLC_ISSUE_LIMIT} 条，开放 Issue 还有更多。</p>
      )}
      <p className="wb-sdlc-line">截至 {state.value.readAt}</p>
    </div>
  )
}

/**
 * 项目指标 · SDLC：提交 / 合入 PR / 开放 Issue 三张卡，独立于业务指标区刷新。
 * 提交画主工作树可达历史的真实时间桶（截断如实标注）；开放 Issue 只展示时点
 * 存量；合入 PR 因缺少真实合入时刻通道保持诚实空态，不用更新时间推造趋势。
 */
export function OverviewSdlcZones({
  repo,
  baseScope,
  baseWorktreeId,
  baseWorktreePath,
  timezone
}: {
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
  timezone?: string
}) {
  const state = useOverviewSdlc({ repo, baseScope, baseWorktreeId, baseWorktreePath })
  const [granularity, setGranularity] = useState<ZoneGranularity>('week')
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const range = useMemo(() => zoneChartRange(granularity, tz), [granularity, tz])
  const labels = useMemo(() => zoneBucketLabels(range), [range])
  const commits = state.commits
  const buckets = useMemo(() => {
    if (!commits || commits.kind !== 'ready') {
      return null
    }
    return bucketCommitCounts(commits.value.items, range, tz, commits.value.hasMore)
  }, [commits, range, tz])
  const currentCommits = buckets?.counts.at(-1) ?? null
  const commitEmptyText = buckets?.truncated
    ? '仅计入最近 200 条提交；本窗口更早的桶留空'
    : '本窗口无可达提交'
  const issues = state.issues
  const issueCount = issues?.kind === 'ready' ? issues.value.count : null

  return (
    <section className="card" id="sdlc-zones">
      <div className="row-between">
        <h6>项目指标 · SDLC</h6>
        <span className="row-start">
          <span className="seg wb-mz-seg" role="group" aria-label="项目指标粒度">
            <label className="seg-opt">
              <input
                type="radio"
                name="wb-sdlc-granularity"
                value="week"
                checked={granularity === 'week'}
                onChange={() => setGranularity('week')}
              />
              周
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="wb-sdlc-granularity"
                value="day"
                checked={granularity === 'day'}
                onChange={() => setGranularity('day')}
              />
              天
            </label>
          </span>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={state.busy}
            title="重新读取提交历史与开放 Issue 存量（与业务指标区独立）"
            onClick={() => void state.refresh()}
          >
            刷新
          </button>
        </span>
      </div>
      <div className="wb-sdlc-grid">
        <div className="wb-sdlc-cell">
          <div className="wb-sdlc-head">
            <span className="wb-sdlc-name">{granularity === 'week' ? '本周提交' : '今日提交'}</span>
            <span className="wb-sdlc-val wb-mono">
              {commits === null ? '—' : commits.kind === 'error' ? '—' : (currentCommits ?? '—')}
            </span>
          </div>
          {commits?.kind === 'error' ? (
            <div className="wb-mz-empty">未知：{commits.message}</div>
          ) : (
            <MetricLineChart
              labels={labels}
              series={[
                {
                  name: '提交',
                  values: buckets?.counts ?? labels.map(() => null),
                  color: SDLC_COMMIT_COLOR,
                  unit: '',
                  fill: true,
                  on: true
                }
              ]}
              emptyText={commits === null ? '未读取' : commitEmptyText}
              hiddenText="无显示系列"
              ariaLabel="提交趋势（按可达历史真实时间统计）"
              currentIndex={labels.length - 1}
              currentNote={commits?.kind === 'ready' ? `截至 ${commits.value.readAt}` : null}
            />
          )}
          {commits?.kind === 'ready' && (
            <p className="wb-sdlc-line wb-muted">
              按项目主工作树可达历史统计，时间为提交作者时间
              {commits.value.hasMore ? '；仅计入最近 200 条' : ''}。
            </p>
          )}
        </div>
        <div className="wb-sdlc-cell">
          <div className="wb-sdlc-head">
            <span className="wb-sdlc-name">合入的 PR</span>
            <span className="wb-sdlc-val wb-mono">—</span>
          </div>
          <div className="wb-sdlc-snapshot">
            <p className="wb-sdlc-line">缺少真实合入时刻，暂不绘制趋势。</p>
            <p className="wb-sdlc-line">不用更新时间推造历史；合入时刻数据源接通后再提供曲线。</p>
          </div>
        </div>
        <div className="wb-sdlc-cell">
          <div className="wb-sdlc-head">
            <span className="wb-sdlc-name">开放 Issue</span>
            <span className="wb-sdlc-val wb-mono">
              {issues === null ? '—' : issues.kind === 'error' ? '—' : issueCount}
            </span>
          </div>
          {state.provider === null && issues === null ? (
            <div className="wb-mz-empty">未识别可用的任务来源</div>
          ) : (
            <SnapshotNote state={issues} />
          )}
        </div>
      </div>
    </section>
  )
}
