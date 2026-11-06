import { Feature, SectionTitle } from './overview-components.jsx'
import {
  historicalFeatures,
  acceptanceForVersion,
  unfinishedTaskLabel,
  snapshot,
  formatTime
} from './overview-data.js'
import { WorkflowProductivity } from './overview-workflow.jsx'
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
  sample,
  native,
  focusRequest,
  openVersion,
  experiments
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
                  <div className="ov-goal-meta">
                    <span>负责人 · {goal.owner}</span>
                    <button className="ov-link" onClick={() => native('目标任务', goal)}>
                      目标任务 · {tasks.length} 项 · {unfinishedTaskLabel(tasks)} ↗
                    </button>
                  </div>
                  <button
                    className="ov-chip ov-acceptance"
                    data-outcome={result?.decision?.outcome || 'unrecorded'}
                    onClick={() => native('版本验收', goal)}
                    title="查看验收屏中的本目标人工结论"
                  >
                    {outcome(result)} ↗
                  </button>
                </div>
                {experiments.sdlc &&
                  goalFeatures.map((f) => (
                    <Feature
                      key={`${selected.version}:${f.id}`}
                      feature={f}
                      selectedVersion={selected.version}
                      focusRequest={focusRequest}
                      openVersion={openVersion}
                    />
                  ))}
              </section>
            )
          })}
          {snapshot.taskStates && (
            <p className="ov-note">
              原型注释: 未完成数量取自 {formatTime(snapshot.taskStates.checkedAt)}
              （北京时间）采集的任务状态，
              不是实时读数，也不是当时验收的任务状态；历史目标与人工结论仍沿原固定材料。
            </p>
          )}
          {experiments.sdlc && (
            <p className="ov-note">
              原型注释: 本静态原型未动态解析特性身份；本稿显式选取 #334／#440（v0.7 为
              #383）演示特性，不改真实标签、标题与计划。其余任务保留原目标和任务入口。
            </p>
          )}
        </div>
      )}

      {experiments.ai && <WorkflowProductivity plan={plan} unplanned={unplanned} />}
    </>
  )
}
