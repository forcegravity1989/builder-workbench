import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'

export function HistoricalRoundCards({
  plan,
  document,
  roundId
}: {
  plan: PlanningMaterial
  document: AcceptanceMaterial
  roundId: string
}) {
  const snapshots = new Map<
    string,
    {
      decision: string
      progress: string
      next?: string
      issueNotes: Record<string, string>
      issueMarks: Record<string, { carry?: boolean; risk?: boolean }>
    }
  >()
  document.results.forEach((result) => {
    result.rounds
      ?.filter((round) => round.id === roundId)
      .forEach((round) => {
        round.snapshot.goals.forEach((snapshot) =>
          snapshots.set(snapshot.goalId, {
            decision: snapshot.decision,
            progress: snapshot.progress,
            next: snapshot.next,
            issueNotes: round.snapshot.issueNotes,
            issueMarks: round.snapshot.issueMarks
          })
        )
      })
  })
  return (
    <section className="va-historical-goals" aria-label="历史轮次目标卡">
      <p className="va-muted">
        历史轮次只读；以下内容来自该轮材料快照，不重新读取当前 Issue 或指标。
      </p>
      {plan.goals.map((goal, index) => {
        const snapshot = snapshots.get(goal.goalId)
        const tone =
          snapshot?.decision === 'met'
            ? 'met'
            : snapshot?.decision === 'not-met'
              ? 'not-met'
              : 'pending'
        return (
          <VersionGoalCard
            key={goal.goalId}
            goal={goal}
            index={index}
            readOnly
            defaultOpen={false}
            summary={
              <span className={`va-goal-summary va-status-${snapshot ? tone : 'unknown'}`}>
                <span aria-label={`历史状态：${snapshot?.decision || 'Unknown'}`}>●</span>
                <span>{snapshot?.decision || 'Unknown'}</span>
                <span>负责人 {goal.owner || '未指派'}</span>
              </span>
            }
            result={
              <div className="va-round-card-snapshot">
                <p>进展：{snapshot?.progress || 'Unknown'}</p>
                {snapshot?.next && <p>下一步：{snapshot.next}</p>}
                {snapshot && Object.keys(snapshot.issueNotes).length > 0 && (
                  <p>
                    Issue 备注：
                    {Object.entries(snapshot.issueNotes)
                      .map(([key, note]) => `${key} ${note || 'Unknown'}`)
                      .join('；')}
                  </p>
                )}
                {snapshot && Object.keys(snapshot.issueMarks).length > 0 && (
                  <p>
                    Issue 标记：
                    {Object.entries(snapshot.issueMarks)
                      .map(
                        ([key, mark]) =>
                          `${key} ${[mark.carry ? '遗留' : null, mark.risk ? '风险' : null].filter(Boolean).join('、') || '无标记'}`
                      )
                      .join('；')}
                  </p>
                )}
              </div>
            }
          />
        )
      })}
    </section>
  )
}
