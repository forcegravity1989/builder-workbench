import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VersionMinutes } from './use-version-minutes'
import { taskDistribution } from './use-version-minutes'
import type { VersionHistoryProblem } from '../../../shared/workbench/version-history'

function acceptanceText(minutes: VersionMinutes): string {
  const document = minutes.acceptance!.document
  const outcomes = { met: '达成', 'not-met': '未达', pending: '待决' }
  const artifactKinds: Record<string, string> = {
    delivery: '交付件',
    package: '交付包',
    verification: '验证报告',
    showcase: '展示材料'
  }
  return (
    [
      ...document.results.flatMap((result) => {
        const goal = minutes.planDocument?.goals.find((item) => item.goalId === result.goalId)
        return [
          `### ${goal?.title ?? result.goalId}`,
          result.decision
            ? `${outcomes[result.decision.outcome]} · ${result.decision.recordedAt.slice(0, 10)}${result.decision.reason ? `\n\n${result.decision.reason}` : ''}`
            : '未结论',
          ...result.readings.map((item) => `- ${item.ref.name}：${item.value}${item.unit}`),
          result.note,
          result.nextStep ? `下一步：${result.nextStep}` : ''
        ]
      }),
      // Per-goal deliveries are retired: the version-level demo environment and
      // the evidence report are registered artifacts, listed below.
      ...(document.minutes
        ? [
            '## 会议纪要',
            ...document.minutes.consensus.map((point) => `- 共识：${point}`),
            ...document.minutes.followups.map(
              (point, index) => `- 遗留 M${index + 1}：${point.text}`
            ),
            document.minutes.confirmed ? '已人工确认' : '待人工确认'
          ]
        : ['纪要未记录']),
      ...document.preparedArtifacts.map(
        (item) => `- ${artifactKinds[item.kind] ?? item.kind}：${item.location}`
      ),
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
  minutes,
  busy,
  historyProblems,
  onRetry,
  source
}: {
  versions: string[]
  version: string | null
  onVersion(version: string): void
  minutes: VersionMinutes | null
  busy: boolean
  historyProblems: VersionHistoryProblem[]
  onRetry(): void
  /** 「来源：<分支> @ <sha12>」— 版本目录读取的主检出基线，随「更新代码」刷新。 */
  source?: string | null
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
        {source && <span className="wb-muted">来源：{source}</span>}
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
      </header>
      {!version ? (
        <p className="wb-muted wb-ov-section-body">
          {busy ? '读取中…' : historyProblems.length ? '暂无可读取的版本材料' : '尚无版本材料'}
        </p>
      ) : (
        <div className="goal-week">
          {columns.map((column) => (
            <article key={`${version}:${column.title}`}>
              <div className="wb-ov-minutes-head">
                <h3>{column.title}</h3>
                {column.data && (
                  <span className="wb-tag wb-tag-outline">
                    {column.data.draft ? '草稿' : '已提交'}
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
