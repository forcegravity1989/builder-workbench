import type {
  AcceptanceMeetingDirective,
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'

export function AcceptanceRounds({ document }: { document: AcceptanceMaterial }) {
  const entries = document.results.flatMap((result) =>
    (result.rounds ?? []).map((round) => ({ goalId: result.goalId, round }))
  )
  const current = entries.toReversed().find(({ round }) => !round.closedAt)
  const history = [
    ...new Map(
      entries
        .filter(({ round }) => round.id !== current?.round.id)
        .map(({ round }) => [round.id, round] as const)
    ).values()
  ]
  const historyEntries = history.map((round) => ({
    round,
    entries: entries.filter((entry) => entry.round.id === round.id)
  }))
  return (
    <section className="va-round-block" aria-label="验收轮次">
      <strong>当前轮</strong>
      <span>{current?.round.week || (entries.length === 0 ? '当前材料' : 'Unknown 周次')}</span>
      <span>
        {current?.round.kind === 'final'
          ? '验收'
          : current
            ? '进展'
            : entries.length === 0
              ? '当前轮'
              : 'Unknown 类型'}
      </span>
      {historyEntries.length > 0 && (
        <details>
          <summary>历史轮次 · {historyEntries.length}</summary>
          {historyEntries.map(({ round, entries: roundEntries }) => (
            <details className="va-round-history" key={round.id}>
              <summary>
                {round.week || 'Unknown 周次'} · {round.kind === 'final' ? '验收' : '进展'}
              </summary>
              <div className="va-round-snapshot">
                {roundEntries.map(({ goalId, round: entryRound }) => (
                  <div key={`${round.id}:${goalId}`}>
                    <strong>目标 {goalId}</strong>
                    {entryRound.snapshot.goals.map((goal) => (
                      <div key={`${round.id}:${goalId}:${goal.goalId}`}>
                        结论 {goal.decision || 'Unknown'} · 进展 {goal.progress || 'Unknown'}
                        {goal.next ? ` · 下一步：${goal.next}` : ''}
                      </div>
                    ))}
                    {Object.entries(entryRound.snapshot.issueNotes).map(([key, note]) => (
                      <div key={`${round.id}:${goalId}:note:${key}`}>
                        Issue {key} · 备注：{note || 'Unknown'}
                      </div>
                    ))}
                    {Object.entries(entryRound.snapshot.issueMarks).map(([key, mark]) => (
                      <div key={`${round.id}:${goalId}:mark:${key}`}>
                        Issue {key} ·{' '}
                        {[mark.carry ? '遗留' : null, mark.risk ? '风险' : null]
                          .filter(Boolean)
                          .join('、') || '无标记'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </details>
      )}
    </section>
  )
}

export function AcceptanceDirectives({
  document,
  plan,
  disabled,
  onChange
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  disabled: boolean
  onChange(document: AcceptanceMaterial, goalId: string): void
}) {
  const entries = document.results.flatMap((result) =>
    (result.meetingDirectives ?? []).map((directive) => ({ goalId: result.goalId, directive }))
  )
  const update = (goalId: string, directives: AcceptanceMeetingDirective[]) =>
    onChange(
      {
        ...document,
        results: document.results.map((result) =>
          result.goalId === goalId ? { ...result, meetingDirectives: directives } : result
        )
      },
      goalId
    )
  const add = () => {
    const target = document.results[0] ?? (plan.goals[0] ? { goalId: plan.goals[0].goalId } : null)
    if (!target) {
      return
    }
    const current = document.results.find((result) => result.goalId === target.goalId)
    if (!current) {
      return
    }
    let sequence = (current.meetingDirectives ?? []).length + 1
    while ((current.meetingDirectives ?? []).some((item) => item.id === `manual-${sequence}`)) {
      sequence += 1
    }
    update(target.goalId, [
      ...(current.meetingDirectives ?? []),
      {
        id: `manual-${sequence}`,
        text: '',
        tag: 'record-remaining',
        status: 'pending',
        source: 'manual'
      }
    ])
  }
  const directivesFor = (goalId: string) =>
    document.results.find((result) => result.goalId === goalId)?.meetingDirectives ?? []
  return (
    <section className="va-directives" aria-label="会议指导与遗留">
      <div className="va-directives-head">
        <strong>会议指导与遗留</strong>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={disabled || document.results.length === 0}
          onClick={add}
        >
          人工补记
        </button>
      </div>
      {entries.length === 0 && <span className="va-muted">暂无待确认指导</span>}
      {entries.map(({ goalId, directive }) => {
        const currentDirectives = directivesFor(goalId)
        const replace = (next: AcceptanceMeetingDirective[]) => update(goalId, next)
        return (
          <div className="va-directive-row" key={`${goalId}:${directive.id}`}>
            <span className="va-muted">
              {plan.goals.find((goal) => goal.goalId === goalId)?.title ?? '未关联目标'} ·{' '}
              {directive.source === 'transcript-summary' ? 'AI 总结' : '人工补记'}
              {directive.sourceRef ? ` · ${directive.sourceRef}` : ''}
            </span>
            <input
              aria-label="会议指导"
              value={directive.text}
              readOnly={disabled || directive.status === 'confirmed'}
              placeholder="记录会议指导或遗留"
              onChange={(event) =>
                replace(
                  currentDirectives.map((item) =>
                    item.id === directive.id ? { ...item, text: event.target.value } : item
                  )
                )
              }
            />
            <select
              aria-label="会议指导标签"
              value={directive.tag}
              disabled={disabled || directive.status === 'confirmed'}
              onChange={(event) =>
                replace(
                  currentDirectives.map((item) =>
                    item.id === directive.id
                      ? { ...item, tag: event.target.value as AcceptanceMeetingDirective['tag'] }
                      : item
                  )
                )
              }
            >
              <option value="resolved-this-acceptance">本次验收已解决</option>
              <option value="next-week-plan">纳入下周计划</option>
              <option value="record-remaining">记录遗留</option>
            </select>
            {directive.status === 'confirmed' ? (
              <span className="va-confirmed">已确认</span>
            ) : (
              <button
                type="button"
                className="wb-btn wb-btn-secondary wb-btn-sm"
                disabled={disabled || !directive.text.trim()}
                onClick={() =>
                  replace(
                    currentDirectives.map((item) =>
                      item.id === directive.id
                        ? { ...item, status: 'confirmed', confirmedAt: new Date().toISOString() }
                        : item
                    )
                  )
                }
              >
                确认
              </button>
            )}
            <button
              type="button"
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={disabled}
              onClick={() => replace(currentDirectives.filter((item) => item.id !== directive.id))}
            >
              删除
            </button>
          </div>
        )
      })}
    </section>
  )
}
