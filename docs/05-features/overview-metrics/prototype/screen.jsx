import { React, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { windows, Grain, Trend, MetricLegend } from './charts.jsx'
import { VersionSummary } from './history.jsx'
import { facts } from './snapshot.js'
import { MetricDetails } from './details.jsx'

function OverviewV8({
  metrics,
  onPrepare,
  planMinutes,
  acceptanceDrafts,
  selection,
  setSelection,
  overviewUI,
  setOverviewUI
}) {
  const { feature, grain, repoGrain, hidden } = overviewUI
  const [detail, setDetail] = useState(null)
  const [notice, setNotice] = useState('')
  const north = metrics.find((metric) => metric.type === 'north_star')
  const setUI = (key, value) => setOverviewUI((state) => ({ ...state, [key]: value }))
  const features = ['', ...new Set(metrics.filter((m) => m.feature).map((m) => m.feature))]
  const bins = windows(grain),
    repoBins = windows(repoGrain)
  const selected = metrics.filter(
    (m) => m.kind === 'script' && m.type !== 'north_star' && m.feature === feature
  )
  const lags = selected.filter((m) => m.type === 'lagging')
  const groups = lags.map((lag) => [
    lag,
    ...selected.filter((m) => m.type === 'leading' && m.leads === lag.name)
  ])
  const unlinked = selected.filter(
    (m) => m.type === 'leading' && !lags.some((lag) => lag.name === m.leads)
  )
  if (unlinked.length) {
    groups.push(unlinked)
  }
  const readingValues = (metric) =>
    bins.map((bin) => {
      const point = metric.latest
      if (!point || typeof point.value !== 'number') {
        return null
      }
      const at = Date.parse(`${point.day}T00:00:00Z`)
      return at >= bin.from && at < bin.to ? point.value : null
    })
  const repoSeries = [
    {
      name: '提交',
      kind: 'commits',
      color: 'var(--color-accent)',
      source: 'bw-orca',
      values: repoBins.map(
        (bin) =>
          facts.commits.filter(
            (commit) =>
              Date.parse(commit.at) >= bin.from &&
              Date.parse(commit.at) < Math.min(bin.to, Date.parse(facts.readAt))
          ).length
      )
    },
    {
      name: '合入 PR',
      kind: 'prs',
      color: 'var(--color-accent-2)',
      source: 'GitHub · 全仓',
      values: repoBins.map(
        (bin) =>
          facts.prs.filter(
            (pr) =>
              Date.parse(pr.mergedAt) >= bin.from &&
              Date.parse(pr.mergedAt) < Math.min(bin.to, Date.parse(facts.readAt))
          ).length
      )
    },
    {
      name: '开放 Issue',
      kind: 'issues',
      color: 'var(--color-warning)',
      source: 'GitHub · 当前',
      values: repoBins.map((_, i) => (i === repoBins.length - 1 ? facts.issues.length : null))
    }
  ]
  const refresh = () => setNotice('原型使用历史快照，未执行实时采集。')
  return (
    <>
      <link rel="stylesheet" href="../overview-metrics/prototype/style.css" />
      <div className="overview-content ov-review">
        <div className="ov-project-row">
          <section className="card ov-project" aria-label="项目信息">
            <div className="ov-heading">
              <h2>Builders’ Workbench</h2>
              <span className="status status-todo">
                <span className="status-dot" />
                未知
              </span>
              <span className="tag tag-outline">bw-orca</span>
            </div>
            <dl className="ov-project-details">
              <dt>想做什么</dt>
              <dd>一张工作台打通所有系统，加速并规范项目运作。</dd>
              <dt>对标</dt>
              <dd>Workbench</dd>
              <dt>目标方向</dt>
              <dd>更多项目纳入 Workbench 管理</dd>
              <dt>项目群</dt>
              <dd>未读取</dd>
              <dt>远端</dt>
              <dd>{facts.repo}</dd>
            </dl>
          </section>
          <section className="card ov-north" aria-label="北极星指标">
            <span className="card-kicker">北极星指标</span>
            <h2>{north?.name.replace(/^\(还没填\)/, '') || '尚未定义'}</h2>
            <div>
              <strong>{north?.latest?.value ?? '—'}</strong>
              <span>{north?.target || '目标未设'}</span>
              <span className="tag tag-neutral">未知</span>
            </div>
          </section>
        </div>
        <VersionSummary {...{ planMinutes, acceptanceDrafts, selection, setSelection }} />
        <section className="ov-section" aria-label="业务指标">
          <header className="ov-section-head">
            <h2>业务指标</h2>
            <nav className="tabs" role="tablist" aria-label="业务指标范围">
              {features.map((item) => (
                <button
                  className="tab"
                  role="tab"
                  key={item}
                  aria-selected={feature === item}
                  onClick={() =>
                    setOverviewUI((state) => ({ ...state, feature: item, hidden: [] }))
                  }
                >
                  {item || '主要'}
                </button>
              ))}
            </nav>
            <div className="ov-tools">
              <Grain
                name="业务指标粒度"
                value={grain}
                onChange={(value) => setUI('grain', value)}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => onPrepare(null)}>
                设置指标
              </button>
              <button
                className="btn btn-secondary btn-icon"
                aria-label="刷新业务指标"
                title="刷新业务指标"
                onClick={refresh}
              >
                <RefreshCw />
              </button>
            </div>
          </header>
          <div className="ov-business-plots">
            {groups.map((group) => {
              const colors = ['accent', 'accent-2', 'warning', 'success', 'danger', 'neutral-600']
              const series = group.map((metric, index) => ({
                id: metric.id,
                name: metric.name,
                values: readingValues(metric),
                color: `var(--color-${colors[index % colors.length]})`,
                dashed: metric.type === 'leading'
              }))
              return (
                <div className="ov-business-plot" key={group[0].id}>
                  <MetricLegend
                    series={series}
                    hidden={hidden}
                    onToggle={(id) =>
                      setUI(
                        'hidden',
                        hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id]
                      )
                    }
                  />
                  <Trend
                    bins={bins}
                    series={series.filter((item) => !hidden.includes(item.id))}
                    label={`${feature || '主要'}业务指标趋势`}
                  />
                  <details className="ov-metric-definitions">
                    <summary>指标详情</summary>
                    <div className="ov-metric-table">
                      <table>
                        <thead>
                          <tr>
                            <th>指标</th>
                            <th>类型</th>
                            <th>最近读数</th>
                            <th>长期目标</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.map((metric) => (
                            <tr key={metric.id}>
                              <td>
                                <button
                                  className="ov-metric-link"
                                  onClick={() => setDetail({ metric })}
                                >
                                  {metric.name}
                                </button>
                              </td>
                              <td>{metric.type === 'lagging' ? '滞后' : '引领'}</td>
                              <td>{metric.latest?.value ?? '—'}</td>
                              <td>{metric.target || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )
            })}
            {!groups.length && <p className="ov-empty">尚未设置业务指标</p>}
          </div>
        </section>
        <section className="ov-section" aria-label="项目指标">
          <header className="ov-section-head">
            <h2>项目指标</h2>
            <span className="ov-period">
              {repoBins[0].label} — {repoBins.at(-1).label}
            </span>
            <div className="ov-tools">
              <Grain
                name="项目指标粒度"
                value={repoGrain}
                onChange={(value) => setUI('repoGrain', value)}
              />
              <button
                className="btn btn-secondary btn-icon"
                aria-label="刷新项目指标"
                title="刷新项目指标"
                onClick={refresh}
              >
                <RefreshCw />
              </button>
            </div>
          </header>
          <div className="ov-repo-grid">
            {repoSeries.map((series) => (
              <article key={series.kind}>
                <div className="ov-stat-heading">
                  <button onClick={() => setDetail({ kind: series.kind })}>{series.name}</button>
                  <span>
                    {series.kind === 'issues' ? '当前' : repoGrain === 'week' ? '本周' : '今日'}
                  </span>
                  <strong>{series.values.at(-1) ?? '—'}</strong>
                </div>
                <Trend compact bins={repoBins} series={[series]} label={`${series.name}趋势`} />
                <div className="ov-stat-source">{series.source}</div>
              </article>
            ))}
          </div>
        </section>
        <footer className="ov-footer">
          <span>原型 · 数据截至 {facts.readAt.slice(0, 16).replace('T', ' ')} UTC</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setDetail({ kind: 'source' })}>
            数据来源
          </button>
        </footer>
        {notice && (
          <div className="ov-notice" role="status">
            <span>{notice}</span>
            <button
              className="btn btn-ghost btn-icon"
              aria-label="关闭提示"
              onClick={() => setNotice('')}
            >
              <X />
            </button>
          </div>
        )}
        {detail && <MetricDetails {...{ detail, onPrepare, setDetail }} />}
      </div>
    </>
  )
}
export { OverviewV8 }
