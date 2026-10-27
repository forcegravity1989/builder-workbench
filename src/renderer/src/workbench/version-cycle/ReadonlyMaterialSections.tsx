import React from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { BoardLines } from '../board-ui'
import {
  issueKey,
  issueMarkFor,
  issueNoteFor
} from '../version-acceptance/acceptance-issue-annotations'
import { DECISION_LABELS, goalOrdinal, shortCommit } from '../version-labels'
export type ViewState =
  | { kind: 'loading' }
  | { kind: 'missing'; message: string }
  | { kind: 'plan'; document: PlanningMaterial; sourceCommit: string; committedAt: string }
  | {
      kind: 'acceptance'
      document: AcceptanceMaterial
      plan: PlanningMaterial
      sourceCommit: string
      committedAt?: string
    }

export function ReadonlyMaterialSections({ state }: { state: ViewState }): React.JSX.Element {
  const goalRows: {
    goalId: string
    goal?: PlanningMaterial['goals'][number]
    result?: AcceptanceMaterial['results'][number]
  }[] =
    state.kind === 'acceptance'
      ? state.plan.goals.map((goal) => ({
          goalId: goal.goalId,
          goal,
          result: state.document.results.find((result) => result.goalId === goal.goalId)
        }))
      : []
  if (state.kind === 'acceptance') {
    for (const result of state.document.results) {
      if (!goalRows.some((row) => row.goalId === result.goalId)) {
        goalRows.push({ goalId: result.goalId, result })
      }
    }
  }
  return (
    <>
      {state.kind === 'loading' ? <p className="vc-notice">材料读取中…</p> : null}
      {state.kind === 'missing' ? <p className="vc-notice">{state.message}</p> : null}
      {state.kind === 'plan' ? (
        <>
          <section className="vc-readonly-section">
            <h3>进展与风险（当时记录）</h3>
            <BoardLines text={state.document.summary.progress} empty="进展未记录" />
            <BoardLines text={state.document.summary.risks} empty="风险未记录" />
          </section>
          <section className="vc-readonly-section">
            <h3>本版目标（{state.document.goals.length}）</h3>
            {state.document.goals.map((goal, index) => (
              <article key={goal.goalId} className="vc-readonly-goal">
                <h4>
                  {goalOrdinal(index)} · {goal.title || '待明确目标'}
                </h4>
                <p className="vc-readonly-meta">
                  {goal.owner || '负责人待明确'}
                  {goal.deadline ? ` · 计划完成 ${goal.deadline}` : ''}
                  {` · 关联 Issue ${state.document.tasks.filter((task) => task.goalId === goal.goalId).length}`}
                </p>
                <h5>验收标准</h5>
                <BoardLines text={goal.acceptance} />
                {goal.deliverable ? (
                  <>
                    <h5>交付约定</h5>
                    <BoardLines text={goal.deliverable} />
                  </>
                ) : null}
                {goal.metricTargets.length > 0 ? (
                  <p className="vc-readonly-meta">
                    指标承诺：
                    {goal.metricTargets
                      .map((target) => `${target.ref.name} → ${target.target}`)
                      .join('；')}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
          {state.document.minutes ? (
            <section className="vc-readonly-section">
              <h3>
                会议纪要
                {state.document.minutes.confirmed ? (
                  <span className="vc-readonly-badge">人已确认（只读）</span>
                ) : (
                  <span className="vc-readonly-badge">未确认</span>
                )}
              </h3>
              <h5>共识</h5>
              {state.document.minutes.consensus.length > 0 ? (
                <ul>
                  {state.document.minutes.consensus.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="vc-readonly-meta">纪要未记录共识条目</p>
              )}
              <h5>遗留</h5>
              {state.document.minutes.followups.length > 0 ? (
                <ul>
                  {state.document.minutes.followups.map((item) => (
                    <li key={item.id}>
                      {item.text}
                      {item.closed ? (
                        <span className="vc-readonly-badge">历史记录：已落实</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vc-readonly-meta">纪要未记录遗留条目</p>
              )}
            </section>
          ) : (
            <section className="vc-readonly-section">
              <h3>会议纪要</h3>
              <p className="vc-readonly-meta">纪要未记录</p>
            </section>
          )}
          <section className="vc-readonly-section">
            <h3>归档 PR</h3>
            {state.document.workflow?.archivePr ? (
              <p className="vc-readonly-meta">
                {state.document.workflow.archivePr.provider} ·{' '}
                {state.document.workflow.archivePr.repository} #
                {state.document.workflow.archivePr.number}
                （合入状态以材料归档事实为准，此处不重复探测）
              </p>
            ) : (
              <p className="vc-readonly-meta">未记录归档 PR</p>
            )}
          </section>
        </>
      ) : null}
      {state.kind === 'acceptance' ? (
        <>
          <section className="vc-readonly-section">
            <h3>验收准备</h3>
            <p className="vc-readonly-meta">
              计划依据：{state.document.planRef.version} ·{' '}
              {state.document.planRef.kind === 'committed'
                ? `已提交 ${shortCommit(state.document.planRef.sourceCommit)}`
                : '当时采用的计划草稿'}
            </p>
            {state.document.preparedArtifacts.length ? (
              <ul>
                {state.document.preparedArtifacts.map((artifact) => (
                  <li key={artifact.artifactId}>
                    {
                      {
                        delivery: '交付件',
                        package: '安装包',
                        verification: '验证报告',
                        showcase: '演示报告'
                      }[artifact.kind]
                    }
                    ：{artifact.location} · {artifact.generatedAt}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vc-readonly-meta">未记录准备资料</p>
            )}
            <h5>演示环境（当时记录）</h5>
            <BoardLines
              text={
                state.document.demoEnv?.kind === 'url'
                  ? `${state.document.demoEnv.label ? `${state.document.demoEnv.label} · ` : ''}${state.document.demoEnv.url}`
                  : state.document.demoEnv?.detail
              }
              empty="未记录"
            />
          </section>
          <section className="vc-readonly-section">
            <h3>逐目标人工结论（{goalRows.length}）</h3>
            {goalRows.map(({ goalId, goal, result }, index) => (
              <article key={goalId} className="vc-readonly-goal">
                <h4>
                  {goalOrdinal(index)} · {goal?.title || goalId}
                  {result?.decision ? (
                    <span className="vc-readonly-badge">
                      {DECISION_LABELS[result.decision.outcome]} · 记录于{' '}
                      {result.decision.recordedAt}
                    </span>
                  ) : (
                    <span className="vc-readonly-badge">结论未记录</span>
                  )}
                </h4>
                {goal ? (
                  <>
                    <h5>验收标准</h5>
                    <BoardLines text={goal.acceptance} />
                  </>
                ) : null}
                {result?.progress ? (
                  <>
                    <h5>进展</h5>
                    <BoardLines text={result.progress} />
                  </>
                ) : null}
                <h5>备注</h5>
                <BoardLines text={result?.note} empty="未记录" />
                <h5>下一步</h5>
                <BoardLines text={result?.nextStep} empty="未记录" />
                <h5>Issue（当时快照）</h5>
                <ReadonlyAcceptanceIssues
                  document={state.document}
                  plan={state.plan}
                  goalId={goalId}
                />
                <p className="vc-readonly-meta">
                  交付件 {result?.deliveries?.length ?? 0} · 轮次 {result?.rounds?.length ?? 0} ·
                  会议指导 {result?.meetingDirectives?.length ?? 0}
                </p>
              </article>
            ))}
          </section>
          <section className="vc-readonly-section">
            <h3>
              会议纪要{' '}
              <span className="vc-readonly-badge">
                {state.document.minutes?.confirmed ? '人已确认（只读）' : '未确认'}
              </span>
            </h3>
            {state.document.minutes ? (
              <>
                <h5>共识</h5>
                {state.document.minutes.consensus.length ? (
                  <ul>
                    {state.document.minutes.consensus.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="vc-readonly-meta">纪要未记录共识条目</p>
                )}
                <h5>遗留</h5>
                {state.document.minutes.followups.length ? (
                  <ul>
                    {state.document.minutes.followups.map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="vc-readonly-meta">纪要未记录遗留条目</p>
                )}
              </>
            ) : (
              <p className="vc-readonly-meta">纪要未记录</p>
            )}
          </section>
          <section className="vc-readonly-section">
            <h3>归档 PR</h3>
            {state.document.workflow?.archivePr ? (
              <p className="vc-readonly-meta">
                {state.document.workflow.archivePr.provider} ·{' '}
                {state.document.workflow.archivePr.repository} #
                {state.document.workflow.archivePr.number}
              </p>
            ) : (
              <p className="vc-readonly-meta">未记录归档 PR</p>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}

function ReadonlyAcceptanceIssues({
  document,
  plan,
  goalId
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goalId: string
}): React.JSX.Element {
  const related = plan.tasks.filter((task) => task.goalId === goalId)
  const result = document.results.find((item) => item.goalId === goalId)
  return related.length ? (
    <ul>
      {related.map((reference) => {
        const key = issueKey(reference)
        const snapshot = document.taskSnapshot?.find((item) => issueKey(item.reference) === key)
        const mark = result && issueMarkFor(result, reference, related)
        const note = result && issueNoteFor(result, reference, related)
        return (
          <li key={key}>
            #{reference.number}{' '}
            {snapshot?.kind === 'ready' ? `${snapshot.title} · ${snapshot.state}` : '状态未知'}
            {mark?.carry ? ' · 历史遗留标记' : ''}
            {note ? <BoardLines text={note} /> : null}
          </li>
        )
      })}
    </ul>
  ) : (
    <p className="vc-readonly-meta">没有关联 Issue</p>
  )
}
