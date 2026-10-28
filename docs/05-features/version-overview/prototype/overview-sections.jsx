import { Feature, SectionTitle, HintButton } from './overview-components.jsx'
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
                <details className="ov-goal-scope">
                  <summary>本版范围</summary>
                  <p className="ov-prewrap">{goal.deliverable || '计划未记录交付范围'}</p>
                </details>
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
        <div className="ov-workflow-heading">
          <strong>workbench-start</strong>
          <span className="muted">0 个统计样本</span>
        </div>
        <p className="ov-note">
          原型注释: 演示尚无统计样本；0 是纳入样本数，不代表 BW 没有使用
          AI。真实会话解析尚未接入，读取失败应显示未知。
        </p>
        <div className="ov-productivity-metrics">
          {[
            [
              '流程使用覆盖',
              '已核对任务中，有会话记录证明使用了项目 AI 流程的任务占比。未核对的任务单独列出，不计入分母。'
            ],
            [
              '首次交付可合入',
              '已有首次评审结论的交付中，无需返工且通过质量检查、经人确认可以合入的占比。尚未评审的交付不计入。'
            ],
            [
              '追加人工介入',
              '初始信息提交后，人参与澄清、设计评审、真机验证等协作的次数。按参与原因分别统计；必要协作不视为质量问题。'
            ],
            [
              '返工轮次',
              '同一次交付被要求修改后，重新提交评审的轮数。同一批意见算一轮，并区分需求变化、实现缺陷和验证遗漏。'
            ]
          ].map(([label, hint], i) => (
            <HintButton key={label} id={`metric-${i}`} text={hint} className="ov-metric-tip">
              <span>{label} ⓘ</span>
              <strong>—</strong>
              <small>暂无样本</small>
            </HintButton>
          ))}
        </div>
        <div className="ov-interventions">
          {[
            [
              '初始输入',
              '文字、截图、附件与约束',
              '开工时提供的需求、截图、附件和约束，作为本次交付的初始条件，不计入追加人工介入。'
            ],
            [
              '需求澄清',
              'askuser 与人工回答',
              '执行中为明确需求而提出的问题及人的回答。必要澄清与信息遗漏导致的追加沟通分别记录。'
            ],
            [
              '原型评审',
              '设计批注与修订',
              '人对原型提出意见、确认或要求修改的过程。首次评审本身不算返工，同一批批注归为一轮。'
            ],
            [
              '真机验证',
              '验证报告、截图与复验',
              '人在实际设备上对指定候选版本进行验证，保留环境、报告和结论。截图本身不代表验证通过。'
            ]
          ].map(([label, description, hint], i) => (
            <HintButton
              key={label}
              id={`intervention-${i}`}
              text={hint}
              className="ov-intervention-tip"
            >
              <strong>{label}</strong>
              <span>{description}</span>
              <small>暂无样本</small>
            </HintButton>
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
