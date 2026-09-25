import type { MetricReading, MetricReadingEvidence } from '../../../../shared/workbench/metrics'
import './metric-evidence.css'
const NO_EVIDENCE: readonly MetricReadingEvidence[] = []

function observationText(reading: MetricReadingEvidence): string {
  const observation = reading.observation
  return observation.kind === 'instant'
    ? `当前值 · 观测于 ${observation.observedAt}`
    : `区间读数 · ${observation.start} 至 ${observation.end}（不含结束时刻，${observation.timezone}）`
}

/** The caller owns targets and decisions; this view only presents collected or saved evidence. */
export function MetricEvidenceView({
  result,
  saved = NO_EVIDENCE
}: {
  result?: MetricReading
  saved?: readonly MetricReadingEvidence[]
}) {
  const readings =
    result?.status === 'ready' ? result.readings : (result?.previous?.readings ?? saved)
  const historical = result?.status !== 'ready' && readings.length > 0
  return (
    <div className="wb-metric-evidence" aria-live="polite">
      {result && result.status !== 'ready' && (
        <p className="wb-metric-message">{result.reason.message}</p>
      )}
      {!readings.length && <p className="wb-metric-message">暂无可核对的读数</p>}
      {historical && (
        <p className="wb-metric-message">
          {result
            ? '已有证据保留原采集时间，不作为本次新读数。'
            : '已保存证据，尚未重新核对采集来源。'}
        </p>
      )}
      {readings.map((reading, index) => (
        <div className="wb-metric-observation" key={`${reading.collectedAt}:${index}`}>
          <div className="wb-metric-value">
            <strong>{String(reading.value)}</strong>
            {reading.unit && <span>{reading.unit}</span>}
          </div>
          <details>
            <summary>{observationText(reading)}</summary>
            <dl>
              <dt>来源</dt>
              <dd>{reading.source}</dd>
              <dt>采集时间</dt>
              <dd>
                <time dateTime={reading.collectedAt}>{reading.collectedAt}</time>
              </dd>
              <dt>配置版本</dt>
              <dd>{reading.ref.configurationCommit}</dd>
              <dt>采集脚本修订</dt>
              <dd>{reading.collectorRevision}</dd>
            </dl>
            {reading.observation.kind === 'instant' && (
              <p className="wb-metric-message">当前值不能证明历史周或区间目标已完成。</p>
            )}
          </details>
        </div>
      ))}
    </div>
  )
}
