import { Feature, SectionTitle, HintButton } from './overview-components.jsx'
import {
  snapshot,
  repository,
  currentTasks,
  historicalTasks,
  historicalFeatures,
  shortTitle,
  material,
  issueState
} from './overview-data.js'
// Used by the shared JSX build factory.
// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies
const outcome = (result) =>
  result?.decision?.outcome === 'met'
    ? '达成'
    : result?.decision?.outcome === 'not-met'
      ? '未达成'
      : '未验收'

export function OverviewSections({
  selected,
  unplanned,
  history,
  plan,
  planLink,
  sample,
  setDialog,
  native,
  openArtifact,
  openSession,
  allTasks,
  setAllTasks,
  focusRequest,
  openVersion
}) {
  const tasks = unplanned ? [] : history ? historicalTasks : currentTasks
  const requirements = unplanned ? [] : history ? historicalFeatures : sample
  return (
    <>
      <section className="ov-section ov-commitments" aria-labelledby="commitments">
        <SectionTitle
          id="commitments"
          title="本版承诺与验收"
          extra={unplanned ? '计划未制定' : history ? '已正式验收' : '尚未验收'}
        />
        {unplanned ? (
          <div className="ov-plan-empty">
            <span>尚无版本计划</span>
            <button className="ov-primary" onClick={() => native('版本计划')}>
              开始制定版本计划
            </button>
          </div>
        ) : (
          <div className="ov-commitment-list">
            {plan.goals.map((g) => {
              const result = history
                ? snapshot.acceptance.results.find((r) => r.goalId === g.goalId)
                : null
              return (
                <button
                  className="ov-commitment"
                  key={g.goalId}
                  onClick={() => setDialog({ kind: 'goal', title: g.title, goal: g })}
                >
                  <span className="ov-label">{g.goalId}</span>
                  <span>
                    <strong>{g.title}</strong>
                    <small>
                      {g.owner}
                      {result?.nextStep ? ` · ${result.nextStep}` : ''}
                    </small>
                  </span>
                  <span className="ov-chip">{outcome(result)}</span>
                </button>
              )
            })}
          </div>
        )}
        {history && (
          <div className="ov-delivery-reference">
            <a href={material('v0.7', 'acceptance')} target="_blank" rel="noreferrer">
              人工验收依据 ↗
            </a>
            <a href={`${repository}/releases/tag/v0.7.0`} target="_blank" rel="noreferrer">
              交付候选 v{snapshot.acceptance.candidateRef.version} ↗
            </a>
            <button onClick={() => setDialog({ kind: 'release', title: 'v0.7 交付依据' })}>
              报告与后续补丁 ↗
            </button>
          </div>
        )}
      </section>

      <section className="ov-section" aria-labelledby="features">
        <SectionTitle
          id="features"
          title="大需求与本版交付"
          extra={unplanned ? '尚未纳入需求' : `${requirements.length} 项`}
        />
        {requirements.length ? (
          requirements.map((f) => (
            <Feature
              key={`${selected.version}:${f.id}`}
              feature={f}
              openArtifact={openArtifact}
              openSession={openSession}
              selectedVersion={selected.version}
              focusRequest={focusRequest}
              openVersion={openVersion}
            />
          ))
        ) : (
          <p className="ov-inline-empty">暂无已纳入的大需求</p>
        )}
      </section>

      <section className="ov-section" aria-labelledby="workflow">
        <SectionTitle
          id="workflow"
          title="小需求 / bug"
          extra={unplanned ? '尚未关联任务' : `${tasks.length} 项`}
        />
        <table className="ov-task-table">
          <thead>
            <tr>
              <th>任务</th>
              <th>AI workflow</th>
              <th>会话与 PR</th>
            </tr>
          </thead>
          <tbody>
            {(allTasks ? tasks : tasks.slice(0, 5)).map((t) => (
              <tr key={t.number}>
                <td>
                  <button
                    className="ov-task-title"
                    title={shortTitle(t.title)}
                    onClick={() => setDialog({ kind: 'task', title: shortTitle(t.title), task: t })}
                  >
                    {shortTitle(t.title)}
                  </button>
                  <small>
                    #{t.number} · {t.goalId} · {t.historical ? '当时状态未归档' : issueState(t)}
                  </small>
                </td>
                <td data-label="AI workflow">
                  <button
                    className="ov-link"
                    onClick={() =>
                      setDialog({
                        kind: 'workflow-evidence',
                        title: `AI workflow · #${t.number}`,
                        task: t
                      })
                    }
                  >
                    待核对
                  </button>
                </td>
                <td data-label="会话与 PR">
                  <div className="ov-task-actions">
                    <button
                      onClick={() =>
                        setDialog({
                          kind: 'task-session',
                          title: `原型注释: 原生任务开工 · #${t.number}`,
                          task: t
                        })
                      }
                    >
                      会话 ↗
                    </button>
                    <button
                      onClick={() =>
                        setDialog({ kind: 'task', title: shortTitle(t.title), task: t })
                      }
                    >
                      PR 依据 ↗
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.length && <p className="ov-inline-empty">暂无关联任务</p>}
        {tasks.length > 5 && (
          <button className="ov-expand-tasks" onClick={() => setAllTasks(!allTasks)}>
            {allTasks ? '收起列表' : `查看全部 ${tasks.length} 项任务`} ↗
          </button>
        )}
      </section>

      <section className="ov-section" aria-labelledby="productivity">
        <SectionTitle id="productivity" title="AI workflow 生产力" extra="Builder Workbench" />
        <div className="ov-workflow-heading">
          <strong>workbench-start</strong>
          <span className="muted">尚无会话统计</span>
        </div>
        <p className="ov-note">原型注释: 会话统计尚未接入，指标暂未提供读数。</p>
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
              <small>未统计</small>
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
          {!unplanned && !history && (
            <button onClick={() => setDialog({ kind: 'review', title: '待审成果' })}>
              意图 / 规格 / 原型评审 ↗
            </button>
          )}
          <button onClick={() => native('版本验收')}>正式验收 ↗</button>
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
