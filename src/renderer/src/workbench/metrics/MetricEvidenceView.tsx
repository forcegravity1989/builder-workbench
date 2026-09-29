import type { MetricReading, MetricReadingEvidence } from '../../../../shared/workbench/metrics'
import './metric-evidence.css'
import {
  addCalendarDays,
  calendarDayStart,
  dayInTimezone
} from '../../../../shared/workbench/metric-windows'
const NO_EVIDENCE: readonly MetricReadingEvidence[] = []

function observationText(reading: MetricReadingEvidence): string {
  const observation = reading.observation
  if (observation.kind === 'instant') {
    return `当前值 · ${observation.observedAt}`
  }
  const day = dayInTimezone(observation.start, observation.timezone)
  const bucketEnd = calendarDayStart(
    addCalendarDays(day, observation.granularity === 'week' ? 7 : 1),
    observation.timezone
  )
  const partial = Date.parse(observation.end) < Date.parse(bucketEnd)
  // An unfinished bucket is "so far"; a finished bucket with a gap is missing coverage, not "so far".
  const label = partial
    ? Date.parse(bucketEnd) > Date.now()
      ? '截至采集时刻'
      : '区间覆盖不全'
    : '区间读数'
  return `${label} · ${observation.start} 至 ${observation.end}（${observation.timezone}）`
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
  const historical = result && result.status !== 'ready' && readings.length > 0
  return (
    <div className="wb-metric-evidence" aria-live="polite">
      {result && result.status !== 'ready' && (
        <p className="wb-metric-message">{result.reason.message}</p>
      )}
      {!readings.length && <p className="wb-metric-message">暂无可核对的读数</p>}
      {historical && (
        <p className="wb-metric-message">已有证据保留原采集时间，不作为本次新读数。</p>
      )}
      {readings.map((reading) => (
        <div
          className="wb-metric-observation"
          key={JSON.stringify([reading.ref, reading.observation, reading.collectedAt])}
        >
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
