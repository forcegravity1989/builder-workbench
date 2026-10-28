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
        <p className="ov-note">
          原型注释:
          尚未解析会话，数值留空。悬停或键盘聚焦指标可看口径；必要的澄清、评审和验证不直接算返工，不用
          Issue 关闭率评价 AI 质量。
        </p>
        <div className="ov-productivity-metrics">
          {[
            [
              '流程使用覆盖',
              '有实际使用项目流程依据的任务 / 已核对任务，同时列未核对数；配置了 Skill 不等于已使用。'
            ],
            [
              '首次交付可合入',
              '完整交付后的首次人工评审可接受比例，须有评审结论和质量门禁；PR 合入、Issue 关闭和 AI 自述不能替代。'
            ],
            [
              '追加人工介入',
              '保留初始信息，区分后续澄清、原型评审、真机验证及其他介入的次数、等待和原因。'
            ],
            [
              '返工轮次',
              '同一次交付被要求修正后的轮次，区分需求变化、实现缺陷与验证遗漏；一批批注不机械算多轮。'
            ]
          ].map(([label, hint], i) => (
            <HintButton
              key={label}
              id={`metric-${i}`}
              text={`原型注释: ${hint}`}
              className="ov-metric-tip"
            >
              <span>{label} ⓘ</span>
              <strong>—</strong>
            </HintButton>
          ))}
        </div>
        <div className="ov-interventions">
          {[
            ['初始输入', '文字、截图、附件与约束', '作为初始上下文保留，不直接算追加介入或返工。'],
            [
              '需求澄清',
              'askuser 与人工回答',
              '区分必要澄清与遗漏导致的追加沟通，不能单凭提问次数判断质量。'
            ],
            [
              '原型评审',
              '设计批注与修订',
              '必要的首次评审不直接算返工；多条批注可属于同一修订轮次。'
            ],
            [
              '真机验证',
              '验证报告、截图与复验',
              '核对候选、环境和人工结论；有图片引用不等于已通过真机验证。'
            ]
          ].map(([label, description, hint], i) => (
            <HintButton
              key={label}
              id={`intervention-${i}`}
              text={`原型注释: ${hint}`}
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
