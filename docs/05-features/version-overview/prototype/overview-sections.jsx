import { Feature, SectionTitle } from './overview-components.jsx'
import { repository, historicalFeatures, acceptanceForVersion } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies
const outcome = (result) =>
  result?.decision?.outcome === 'met'
    ? '达成'
    : result?.decision?.outcome === 'not-met'
      ? '未达成'
      : '未记录验收'

export function OverviewSections({
  selected,
  unplanned,
  history,
  plan,
  planLink,
  sample,
  setDialog,
  native,
  openSession,
  focusRequest,
  openVersion
}) {
  const requirements = unplanned ? [] : history ? historicalFeatures : sample
  return (
    <>
      {unplanned ? (
        <section className="ov-section" aria-label="版本目标">
          <SectionTitle title="版本目标" extra="计划未制定" />
          <div className="ov-plan-empty">
            <span>尚无版本计划</span>
            <button className="ov-primary" onClick={() => native('版本计划')}>
              开始制定版本计划
            </button>
          </div>
        </section>
      ) : (
        <div className="ov-goals" aria-label="版本目标">
          {plan.goals.map((goal) => {
            const result = acceptanceForVersion(selected.version)?.results.find(
              (r) => r.goalId === goal.goalId
            )
            const tasks = plan.tasks.filter((t) => t.goalId === goal.goalId)
            const goalFeatures = requirements.filter((f) => f.goalId === goal.goalId)
            const otherCount = tasks.filter(
              (t) => !goalFeatures.some((f) => f.id === String(t.number))
            ).length
            return (
              <section
                className="ov-section ov-goal"
                key={goal.goalId}
                aria-labelledby={`goal-${goal.goalId}`}
              >
                <div className="ov-goal-heading">
                  <h2 id={`goal-${goal.goalId}`}>
                    <span className="ov-label">{goal.goalId}</span>
                    {goal.title}
                  </h2>
                  <button
                    className="ov-chip ov-acceptance"
                    data-outcome={result?.decision?.outcome || 'unrecorded'}
                    onClick={() => native('版本验收', goal)}
                    title="查看验收屏中的本目标人工结论"
                  >
                    {outcome(result)} ↗
                  </button>
                </div>
                <div className="ov-goal-meta">
                  <span>负责人 · {goal.owner}</span>
                  <button
                    className="ov-link"
                    onClick={() => setDialog({ kind: 'goal', title: goal.title, goal })}
                  >
                    范围与验收标准 ↗
                  </button>
                  <button className="ov-link" onClick={() => native('目标任务', goal)}>
                    目标任务 · {tasks.length} 项 ↗
                  </button>
                </div>
                {result && (
                  <div className="ov-goal-conclusion">
                    <span>人工验收 · {result.decision?.source || '来源未记录'}</span>
                    {result.decision?.recordedAt && (
                      <time dateTime={result.decision.recordedAt}>
                        {result.decision.recordedAt.slice(0, 16).replace('T', ' ')} UTC
                      </time>
                    )}
                    {result.nextStep && <span>后续处理 · {result.nextStep}</span>}
                  </div>
                )}
                {goalFeatures.map((f) => (
                  <Feature
                    key={`${selected.version}:${f.id}`}
                    feature={f}
                    openSession={openSession}
                    selectedVersion={selected.version}
                    focusRequest={focusRequest}
                    openVersion={openVersion}
                  />
                ))}
                {goalFeatures.length > 0 && otherCount > 0 && (
                  <div className="ov-other-tasks">
                    <span>其他关联任务 · {otherCount} 项</span>
                    <button className="ov-link" onClick={() => native('目标任务', goal)}>
                      查看本目标全部 {tasks.length} 项任务 ↗
                    </button>
                  </div>
                )}
              </section>
            )
          })}
          <p className="ov-note">
            原型注释: 特性主单标记与标题归属规则尚未接入；本稿显式选取 #334／#440（v0.7 为
            #334／#383）演示特性，不改真实标签、标题与计划。其余任务保留原目标和任务入口。
          </p>
        </div>
      )}

      <section className="ov-section" aria-labelledby="productivity">
        <SectionTitle id="productivity" title="AI workflow 生产力" extra="Builder Workbench" />
        <p className="ov-note">
          原型注释: 本轮仅保留指标布局占位；具体指标与统计由 workflow 专项确定，不显示模拟数值。
        </p>
        <div className="ov-productivity-metrics">
          {[1, 2, 3, 4].map((id) => (
            <div className="ov-metric-placeholder" key={id}>
              <span>指标待定</span>
              <strong>—</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="ov-section" aria-labelledby="records">
        <SectionTitle id="records" title="本版记录" />
        <div className="ov-records">
          {unplanned ? (
            <button onClick={() => native('版本计划')}>版本计划 ↗</button>
          ) : (
            <a href={planLink} target="_blank" rel="noreferrer">
              计划与纪要 ↗
            </a>
          )}
          <button onClick={() => native('版本验收')}>正式验收 ↗</button>
          {history && (
            <button onClick={() => setDialog({ kind: 'release', title: 'v0.7 交付依据' })}>
              交付依据与后续发布 ↗
            </button>
          )}
          {!unplanned && (
            <a href={`${repository}/pull/${history ? 429 : 446}`} target="_blank" rel="noreferrer">
              归档 PR ↗
            </a>
          )}
        </div>
      </section>
    </>
  )
}
