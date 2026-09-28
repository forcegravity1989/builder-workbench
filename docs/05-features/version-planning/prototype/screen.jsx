import { React } from 'react'
import { Field } from './shared.jsx'
import { ChartNoAxesCombined, ChevronRight, Pencil, RefreshCw } from 'lucide-react'
import { metrics } from './snapshot.js'

function PlanningContent({
  go,
  goals,
  progress,
  refreshMetrics,
  risk,
  setModal,
  setProgress,
  setRisk,
  setVersion,
  update,
  versionTasks
}) {
  return (
    <>
      <section className="briefs">
        <div className="progress-brief">
          <label>版本进展</label>
          <Field label="版本进展" value={progress} onChange={setProgress} rows={3} />
        </div>
        <div className="risk-brief">
          <label>风险上报</label>
          <Field
            label="风险上报"
            value={risk}
            onChange={setRisk}
            placeholder="有风险时填写"
            rows={2}
          />
        </div>
      </section>
      <div className="section-heading">
        <h2>当前版本目标</h2>
        <span>Top 3</span>
        <button
          className="btn btn-ghost"
          onClick={() => {
            go('friday')
            setVersion('v0.4')
          }}
        >
          上版验收
          <ChevronRight />
        </button>
      </div>
      <section className="goal-sheet">
        {goals.map((g) => {
          const m = metrics.find((x) => x.id === g.metricId)
          return (
            <article className="goal-row" data-goal={g.id} key={g.id}>
              <div className="goal-heading">
                <span className="goal-id">{g.label}</span>
                <Field
                  label={`${g.label} 目标`}
                  value={g.title}
                  onChange={(v) => update(g.id, 'title', v)}
                />
                <button
                  className="btn btn-icon btn-ghost"
                  aria-label={`编辑 ${g.label} 补充内容`}
                  onClick={() =>
                    setModal({
                      type: 'goal',
                      id: g.id,
                      title: `${g.label} · 目标补充`
                    })
                  }
                >
                  <Pencil />
                </button>
              </div>
              <div className="delivery-row">
                <span>交付件</span>
                <Field
                  label={`${g.label} 交付件`}
                  value={g.delivery}
                  onChange={(v) => update(g.id, 'delivery', v)}
                  placeholder="交付什么"
                />
              </div>
              {g.criteria && (
                <div className="criteria-row">
                  <span>验收标准</span>
                  <p>{g.criteria}</p>
                </div>
              )}
              {m && (
                <div className="metric-row">
                  <label>
                    <ChartNoAxesCombined />
                    <select
                      aria-label={`${g.label} 指标`}
                      value={g.metricId}
                      onChange={(e) => update(g.id, 'metricId', e.target.value)}
                    >
                      <option value="">不承诺指标</option>
                      {metrics
                        .filter((x) => x.kind === 'script')
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="metric-value">
                    <span>当前</span>
                    <strong title="本期尚未采集">{m.current ?? '—'}</strong>
                  </div>
                  <div className="metric-target">
                    <label htmlFor={`target-${g.id}`}>
                      {m.current === null ? '目标草案' : '目标'}
                    </label>
                    <input
                      id={`target-${g.id}`}
                      aria-label={`${g.label} 指标目标`}
                      value={g.target}
                      onChange={(e) => update(g.id, 'target', e.target.value)}
                    />
                  </div>
                  <button className="btn btn-ghost metric-collect" onClick={refreshMetrics}>
                    <RefreshCw />
                    采集
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </section>
      {versionTasks()}
    </>
  )
}
export { PlanningContent }
