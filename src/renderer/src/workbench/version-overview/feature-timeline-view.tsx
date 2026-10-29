import { useEffect, useRef, useState } from 'react'
import {
  timelineClusters,
  timelineRange,
  validTime,
  type FeatureData,
  type FeatureEvent
} from './feature-model'
import { featureTimeline, MILESTONES, MILESTONE_LABELS, type Milestone } from './feature-timeline'
import { elapsedLabel, timeLabel, openEvidenceUrl } from './overview-time'

export function FeatureTimelineView({ feature }: { feature: FeatureData }) {
  const axisRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  const [selected, setSelected] = useState<string>('design')
  const timeline = featureTimeline(feature)
  const points: { key: Milestone | 'version'; event: FeatureEvent }[] = MILESTONES.flatMap((key) =>
    timeline.points[key] ? [{ key, event: timeline.points[key]! }] : []
  )
  points.push(
    ...feature.events
      .filter((event) => event.phase === 'version' && !event.deliveryKind && validTime(event.at))
      .map((event) => ({ key: 'version' as const, event }))
  )
  const events = points.map((point) => point.event)
  const range = timelineRange(events)
  const clusters = timelineClusters(events, width)
  useEffect(() => {
    const element = axisRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(Math.max(560, entry.contentRect.width))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const missing = MILESTONES.filter((key) => !timeline.points[key])
  return (
    <div className="bwo-timeline">
      <div className="bwo-timeline-heading">
        <strong>特性历程与版本交付</strong>
        <span title="Asia/Shanghai · UTC+08:00">北京时间 · 日历历时</span>
      </div>
      <div
        className="bwo-axis-scroll"
        ref={axisRef}
        tabIndex={0}
        role="region"
        aria-label={`${feature.root.title}成果时间轴，可横向滚动`}
      >
        {range ? (
          <div className="bwo-axis" style={{ width }}>
            <div className="bwo-axis-line" />
            {timeline.segments.map((segment) => {
              if (segment.duration === null || !segment.start || !segment.end) {
                return null
              }
              return (
                <button
                  key={segment.id}
                  className="bwo-stage-range"
                  aria-pressed={selected === segment.id}
                  style={{
                    left: 80 + (range.position(Date.parse(segment.start)) * (width - 160)) / 100,
                    width: range.duration ? (segment.duration * (width - 160)) / range.duration : 0
                  }}
                  title={`${segment.label}：${timeLabel(segment.start)} → ${timeLabel(segment.end)}，${elapsedLabel(segment.duration)}（含等待，不是人工工时）`}
                  onClick={() => setSelected(segment.id!)}
                >
                  <strong>{segment.label}</strong>
                  <span>{elapsedLabel(segment.duration)}</span>
                </button>
              )
            })}
            {clusters.map(({ x, events: cluster }, index) => (
              <button
                key={cluster[0]!.id}
                className={`bwo-node bwo-node-${index % 2}`}
                style={{ left: x }}
                title={cluster.map((event) => `${event.label} · ${timeLabel(event.at)}`).join('\n')}
                onClick={() => {
                  const point = points.find((item) => item.event.id === cluster[0]!.id)
                  setSelected(point?.key === 'baseline' ? 'intent' : (point?.key ?? ''))
                }}
              >
                <i />
                <span className="bwo-node-label">
                  {cluster.map((event) => {
                    const key = points.find((item) => item.event.id === event.id)!.key
                    return (
                      <span key={event.id}>
                        <strong>
                          {key === 'version' ? event.label : MILESTONE_LABELS[key]}
                          {event.version && ['pre', 'release'].includes(key)
                            ? ` · ${event.version}`
                            : ''}
                        </strong>
                        <time dateTime={event.at}>{timeLabel(event.at)}</time>
                      </span>
                    )
                  })}
                </span>
              </button>
            ))}
            <span className="bwo-axis-start">{timeLabel(range.start)}</span>
            <span className="bwo-axis-end">{timeLabel(range.end)}</span>
          </div>
        ) : (
          <p className="bwo-muted py-6">尚无可核对的特性节点时间。</p>
        )}
      </div>
      {missing.length > 0 && (
        <p className="bwo-muted">
          未记录：{missing.map((key) => MILESTONE_LABELS[key]).join('、')}。
        </p>
      )}
      <div className="bwo-source-row" aria-label="采集来源">
        {timeline.sources
          .filter((group) => group.id !== 'version' || group.events.length)
          .map((group) => (
            <div className="bwo-source-group" data-selected={selected === group.id} key={group.id}>
              <span>{group.label}</span>
              {group.events.length ? (
                group.events.map((event) =>
                  event.url ? (
                    <button
                      key={event.id}
                      className="bwo-link"
                      onClick={() => openEvidenceUrl(event.url)}
                      title={`${event.label}${event.at ? ` · ${timeLabel(event.at)}` : ''}；读取于 ${timeLabel(event.readAt)}`}
                    >
                      {event.phase === 'intent' ? event.version : event.label} ↗
                    </button>
                  ) : (
                    <span key={event.id}>链接未记录</span>
                  )
                )
              ) : (
                <span>未记录</span>
              )}
            </div>
          ))}
      </div>
      {feature.pulls
        .filter((pull) => !['design', 'development'].includes(pull.phase ?? ''))
        .map((pull) => (
          <button
            key={pull.url}
            className="bwo-link bwo-muted mr-3"
            onClick={() => openEvidenceUrl(pull.url)}
          >
            阶段未确认 · PR / MR #{pull.number} ↗
          </button>
        ))}
    </div>
  )
}
