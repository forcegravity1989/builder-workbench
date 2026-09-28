import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VersionMinutes } from './use-version-minutes'
import { taskDistribution } from './use-version-minutes'
import type { VersionHistoryProblem } from '../../../shared/workbench/version-history'

function acceptanceText(minutes: VersionMinutes): string {
  const document = minutes.acceptance!.document
  const outcomes = { met: '达成', 'not-met': '未达', pending: '待决' }
  return (
    [
      ...document.results.flatMap((result) => {
        const goal = minutes.planDocument?.goals.find((item) => item.goalId === result.goalId)
        return [
          `### ${goal?.title ?? result.goalId}`,
          result.decision
            ? `${outcomes[result.decision.outcome]} · ${result.decision.recordedAt}\n\n${result.decision.reason}`
            : '未结论',
          ...result.deliveries.map((item) => `- ${item.title}：${item.location}`),
          ...result.readings.map(
            (item) =>
              `- ${item.ref.name}：${item.value}${item.unit}（${item.collectedAt}；${item.source}）`
          ),
          result.note,
          result.nextStep ? `下一步：${result.nextStep}` : ''
        ]
      }),
      document.candidateRef ? `候选提交：${document.candidateRef.commit}` : '',
      ...document.preparedArtifacts.map((item) => `- ${item.kind}：${item.location}`),
      taskDistribution(document)
        .map(([state, count]) => `${state} ${count}`)
        .join(' · ')
    ]
      .filter(Boolean)
      .join('\n\n') || '暂无验收结论'
  )
}
export function OverviewVersionMinutes({
  versions,
  version,
  onVersion,
  cycles,
  cycle,
  onCycle,
  minutes,
  historyProblems,
  onRetry
}: {
  versions: string[]
  version: string | null
  onVersion(version: string): void
  cycles: string[]
  cycle: string
  onCycle(cycle: string): void
  minutes: VersionMinutes | null
  historyProblems: VersionHistoryProblem[]
  onRetry(): void
}) {
  const columns = [
    { title: '计划', data: minutes?.plan, text: minutes?.plan?.text, error: minutes?.planError },
    {
      title: '验收',
      data: minutes?.acceptance,
      text: minutes?.acceptance ? acceptanceText(minutes) : '',
      error: minutes?.acceptanceError
    }
  ]
  return (
    <section className="card wb-ov-section" id="version-card" aria-label="版本计划与验收">
      <header className="wb-ov-section-head">
        <h2>版本计划与验收</h2>
        <nav className="tabs" role="tablist" aria-label="版本">
          {versions.map((item) => (
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={version === item}
              key={item}
              onClick={() => onVersion(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        {cycles.length > 1 && (
          <select
            className="wb-ov-cycle"
            aria-label="纪要轮次"
            value={cycle}
            onChange={(event) => onCycle(event.target.value)}
          >
            {cycles.map((item) => (
              <option key={item} value={item}>
                {item === 'current' ? '当前材料' : item}
              </option>
            ))}
          </select>
        )}
      </header>
      {historyProblems.length > 0 && (
        <details className="wb-ov-section-body">
          <summary>无法读取的归档（{historyProblems.length}）</summary>
          <ul>
            {historyProblems.map((problem) => (
              <li
                key={`${problem.sourceCommit}:${problem.workflow}:${problem.version}:${problem.code}`}
              >
                {problem.version} · {problem.workflow === 'plan' ? '计划' : '验收'} ·{' '}
                {problem.sourceCommit.slice(0, 12)}：{problem.message}
              </li>
            ))}
          </ul>
          <button type="button" className="wb-btn wb-btn-secondary wb-btn-sm" onClick={onRetry}>
            重试
          </button>
        </details>
      )}
      {!version ? (
        <p className="wb-muted wb-ov-section-body">
          {historyProblems.length ? '暂无可读取的版本材料' : '尚无版本材料'}
        </p>
      ) : (
        <div className="goal-week">
          {columns.map((column) => (
            <article key={`${version}:${cycle}:${column.title}`}>
              <div className="wb-ov-minutes-head">
                <h3>{column.title}</h3>
                {column.data && (
                  <span className="wb-tag wb-tag-outline">
                    {column.data.draft ? '草稿' : '归档'}
                  </span>
                )}
              </div>
              <div
                className="wb-ov-minutes-body"
                role="region"
                aria-label={`${column.title}纪要全文`}
                tabIndex={0}
              >
                {minutes?.loading ? (
                  <p className="wb-muted">读取中…</p>
                ) : column.error ? (
                  <div role="alert">
                    <p>{column.error}</p>
                    <button
                      type="button"
                      className="wb-btn wb-btn-secondary wb-btn-sm"
                      onClick={onRetry}
                    >
                      重试
                    </button>
                  </div>
                ) : column.data ? (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{column.text ?? ''}</ReactMarkdown>
                    <p className="wb-muted">{column.data.source}</p>
                  </>
                ) : (
                  <p className="wb-muted">暂无{column.title}纪要</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
