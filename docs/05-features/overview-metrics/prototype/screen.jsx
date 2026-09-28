import { React, useState } from 'react'
import {
  GitCommitHorizontal,
  GitPullRequest,
  Inbox,
  GitBranch,
  Info,
  Target,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Check,
  ArrowRight,
  X
} from 'lucide-react'
import { windows, Grain, Trend } from './charts.jsx'
import { VersionSummary } from './history.jsx'
import { facts } from './snapshot.js'
import { MetricDetails } from './details.jsx'

function OverviewV8({
  metrics,
  onPlan,
  onAcceptance,
  onPrepare,
  planMinutes,
  acceptanceDrafts,
  selection,
  setSelection,
  overviewUI,
  setOverviewUI
}) {
  const { feature, grain, repoGrain, hidden } = overviewUI
  const setUI = (key, value) =>
    setOverviewUI((x) => ({
      ...x,
      [key]: typeof value === 'function' ? value(x[key]) : value
    }))
  const setFeature = (v) => setUI('feature', v),
    setGrain = (v) => setUI('grain', v),
    setRepoGrain = (v) => setUI('repoGrain', v),
    setHidden = (v) => setUI('hidden', v)
  const [detail, setDetail] = useState(null),
    [notice, setNotice] = useState('')
  const features = [
      '',
      ...new Set(metrics.filter((m) => m.type !== 'north_star' && m.feature).map((m) => m.feature))
    ],
    bins = windows(grain),
    repoBins = windows(repoGrain),
    selected = metrics.filter(
      (m) => m.kind === 'script' && m.type !== 'north_star' && m.feature === feature
    )
  const lags = selected.filter((m) => m.type === 'lagging'),
    groups = lags.map((lag) => [
      lag,
      ...selected.filter(
        (m) => m.type === 'leading' && (m.leads === lag.name || (!m.leads && lag === lags[0]))
      )
    ])
  const readingValues = (m) =>
    bins.map((b) => {
      const p = m.latest
      if (!p) {
        return null
      }
      const at = Date.parse(`${p.day}T00:00:00Z`)
      return at >= b.from && at < b.to ? Number(p.value) : null
    })
  const repoSeries = [
    {
      name: repoGrain === 'week' ? '本周提交' : '今日提交',
      kind: 'commits',
      icon: GitCommitHorizontal,
      color: 'var(--color-accent)',
      source: 'bw-orca · 当前分支',
      values: repoBins.map(
        (b) =>
          facts.commits.filter(
            (c) =>
              Date.parse(c.at) >= b.from &&
              Date.parse(c.at) < Math.min(b.to, Date.parse(facts.readAt))
          ).length
      )
    },
    {
      name: repoGrain === 'week' ? '本周合入 PR' : '今日合入 PR',
      kind: 'prs',
      icon: GitPullRequest,
      color: 'var(--color-accent-2)',
      source: 'GitHub · 全仓',
      values: repoBins.map(
        (b) =>
          facts.prs.filter(
            (p) =>
              Date.parse(p.mergedAt) >= b.from &&
              Date.parse(p.mergedAt) < Math.min(b.to, Date.parse(facts.readAt))
          ).length
      )
    },
    {
      name: '未处理 Issue',
      kind: 'issues',
      icon: Inbox,
      color: 'var(--color-warning)',
      source: 'GitHub · 当前开放',
      values: repoBins.map((b, i) => (i === repoBins.length - 1 ? facts.issues.length : null))
    }
  ]
  function refresh(scope) {
    setNotice(
      `${scope}：当前为 ${facts.readAt
        .slice(0, 16)
        .replace('T', ' ')} UTC 采集快照；原型未连接实时刷新，未改写读数。`
    )
  }
  return (
    <div className="overview-content ov6">
      <div className="ov6-project-grid">
        <section className="ov6-project">
          <div className="ov6-project-heading">
            <h2>Builders’ Workbench</h2>
            <span className="tag tag-outline">
              <GitBranch />
              bw-orca
            </span>
            <button
              className="btn btn-icon btn-ghost"
              aria-label="项目与数据来源"
              onClick={() =>
                setDetail({
                  kind: 'source'
                })
              }
            >
              <Info />
            </button>
          </div>
          <p>一张工作台打通所有系统，加速并规范项目运作。</p>
          <div className="ov6-project-meta">
            <span>
              对标 <b>workbuddy</b>
            </span>
            <span>
              目标方向 <b>更多项目纳入 Workbench 管理</b>
            </span>
          </div>
        </section>
        <section className="ov6-north">
          <div>
            <Target />
            <h3>北极星</h3>
            <span className="tag tag-neutral">待定义</span>
          </div>
          <p>
            <strong>—</strong>
            <span>尚未形成可采集的衡量标准</span>
          </p>
          <button className="btn btn-ghost" onClick={() => onPrepare(null)}>
            定义指标
            <ArrowUpRight />
          </button>
        </section>
      </div>
      <VersionSummary
        planMinutes={planMinutes}
        acceptanceDrafts={acceptanceDrafts}
        selection={selection}
        setSelection={setSelection}
        onPlan={onPlan}
        onAcceptance={onAcceptance}
      />
      <section className="ov6-block" aria-label="业务指标">
        <header>
          <div>
            <h2>业务指标</h2>
            <span>滞后与引领</span>
          </div>
          <div className="ov6-tools">
            <span className="ov6-window">
              {bins[0].label} — {bins.at(-1).label}
            </span>
            <Grain name="业务指标粒度" value={grain} onChange={setGrain} />
            <button className="btn btn-ghost" onClick={() => onPrepare(null)}>
              <Plus />
              配置指标
            </button>
            <button
              className="btn btn-secondary"
              aria-label="刷新业务指标"
              onClick={() => refresh('业务指标')}
            >
              <RefreshCw />
              刷新
            </button>
          </div>
        </header>
        <nav className="tabs ov6-tabs" role="tablist" aria-label="业务指标特性">
          {features.map((f) => (
            <button
              className="tab"
              role="tab"
              key={f}
              aria-selected={feature === f}
              onClick={() => {
                setFeature(f)
                setHidden([])
              }}
            >
              {f ? (f.endsWith('特性') ? f : `${f}特性`) : '主要'}
            </button>
          ))}
        </nav>
        <div className="ov6-business-plots">
          {groups.map((group, i) => (
            <div className="ov6-business-plot" key={i}>
              <div className="ov6-series-head">
                <span>指标与关系</span>
                <span>本期</span>
                <span>长期目标</span>
                <span>历史查询</span>
              </div>
              {group.map((m, j) => {
                const color = j === 0 ? 'var(--color-accent)' : 'var(--color-accent-2)',
                  on = !hidden.includes(m.id)
                return (
                  <div className={`ov6-series-row ${!on ? 'off' : ''}`} key={m.id}>
                    <div>
                      <button
                        className="ov6-series-toggle"
                        aria-label={`显示 ${m.name}`}
                        aria-pressed={on}
                        style={{
                          color
                        }}
                        onClick={() =>
                          setHidden((xs) => (on ? [...xs, m.id] : xs.filter((x) => x !== m.id)))
                        }
                      >
                        {on ? <Check /> : <span />}
                      </button>
                      <button
                        className="ov6-metric-name"
                        onClick={() =>
                          setDetail({
                            kind: 'metric',
                            metric: m
                          })
                        }
                      >
                        {m.name}
                      </button>
                      <span className="ov6-kind">{j === 0 ? '滞后' : '引领'}</span>
                      {m.leads && (
                        <span className="ov6-leads" title={`引领 → ${m.leads}`}>
                          <ArrowRight />
                        </span>
                      )}
                    </div>
                    <strong title="本期未采集">—</strong>
                    <span className="ov6-numeric">{m.target || '—'}</span>
                    <span className="ov6-last">
                      {m.latest ? (
                        <>
                          <b>{m.latest.value}</b>
                          <small>{m.latest.day.slice(5)} · 脚本实测</small>
                        </>
                      ) : (
                        '未采集'
                      )}
                    </span>
                  </div>
                )
              })}
              <Trend
                bins={bins}
                series={group
                  .filter((m) => !hidden.includes(m.id))
                  .map((m) => ({
                    name: m.name,
                    values: readingValues(m),
                    color: m.type === 'lagging' ? 'var(--color-accent)' : 'var(--color-accent-2)'
                  }))}
                label={`${feature || '主要'}业务指标趋势`}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="ov6-block ov6-repo" aria-label="项目指标">
        <header>
          <div>
            <h2>项目指标</h2>
            <span>研发活动</span>
          </div>
          <div className="ov6-tools">
            <span className="ov6-window">
              {repoBins[0].label} — {repoBins.at(-1).label}
            </span>
            <Grain name="项目指标粒度" value={repoGrain} onChange={setRepoGrain} />
            <button
              className="btn btn-secondary"
              aria-label="刷新项目指标"
              onClick={() => refresh('项目指标')}
            >
              <RefreshCw />
              刷新
            </button>
          </div>
        </header>
        <div className="ov6-repo-grid">
          {repoSeries.map((s) => {
            const Icon = s.icon
            return (
              <article key={s.kind}>
                <div className="ov6-stat-heading">
                  <Icon />
                  <h3>{s.name}</h3>
                  <button
                    className="btn btn-icon btn-ghost"
                    aria-label={`${s.name}口径`}
                    onClick={() =>
                      setDetail({
                        kind: s.kind
                      })
                    }
                  >
                    <Info />
                  </button>
                </div>
                <div className="ov6-stat-value">
                  <strong>{s.values.at(-1) ?? '—'}</strong>
                  <span>{s.source}</span>
                </div>
                <Trend compact bins={repoBins} series={[s]} label={`${s.name}趋势`} />
              </article>
            )
          })}
        </div>
      </section>
      <footer className="ov6-footer">
        <span>采集于 {facts.readAt.slice(5, 16).replace('T', ' ')} UTC</span>
        <button
          className="btn btn-ghost"
          onClick={() =>
            setDetail({
              kind: 'source'
            })
          }
        >
          查看来源
          <ArrowUpRight />
        </button>
      </footer>
      {notice && (
        <div className="ov6-notice" role="status">
          <span>{notice}</span>
          <button
            className="btn btn-icon btn-ghost"
            aria-label="关闭提示"
            onClick={() => setNotice('')}
          >
            <X />
          </button>
        </div>
      )}
      {detail && (
        <MetricDetails
          {...{
            detail,
            onPrepare,
            setDetail
          }}
        />
      )}
    </div>
  )
}
export { OverviewV8 }
