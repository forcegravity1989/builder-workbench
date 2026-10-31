import type { CSSProperties } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { FeatureData } from './feature-model'
import { featureTimelineLayout } from './feature-timeline-layout'
import { timeLabel, openEvidenceUrl } from './overview-time'
const durationLabel = (milliseconds: number) => {
  const minutes = Math.floor(milliseconds / 60000)
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`
}

export function FeatureTimelineView({
  feature,
  version
}: {
  feature: FeatureData
  version: string
}) {
  const layout = featureTimelineLayout(feature)
  const width = Math.max(600, layout.total * 4.5)
  const percent = (hours: number) => `${String(layout.total ? (hours / layout.total) * 100 : 0)}%`
  const markerEnds: number[] = []
  const markers = layout.markers.map((marker) => {
    const x = (marker.offset / layout.total) * width
    const left = Math.max(0, Math.min(width - 112, x - 56))
    let lane = markerEnds.findIndex((end) => end + 8 < left)
    if (lane < 0) {
      lane = markerEnds.length
    }
    markerEnds[lane] = left + 112
    return { ...marker, lane, labelShift: x - left }
  })
  const test = layout.slots[3]!
  const deliveries = layout.deliveries.length
    ? layout.deliveries.map(({ event, offset }) => ({
        id: event.id,
        label: event.label,
        at: event.at,
        url: event.url,
        offset
      }))
    : [
        {
          id: 'pending',
          label: `${version} · 首次交付`,
          at: '',
          url: '',
          offset: test.offset + test.hours
        }
      ]
  const deliveryEnds: number[] = []
  const cards = deliveries.map((delivery) => {
    const x = (delivery.offset / layout.total) * width
    const left = Math.max(0, Math.min(width - 128, x - 64))
    let lane = deliveryEnds.findIndex((end) => end + 8 < left)
    if (lane < 0) {
      lane = deliveryEnds.length
    }
    deliveryEnds[lane] = left + 128
    return { ...delivery, lane, labelShift: x - left }
  })
  const cardHeight = Math.max(1, deliveryEnds.length) * 64
  const axisTop = cardHeight + Math.max(2, markerEnds.length) * 44
  return (
    <div className="bwo-timeline">
      <div className="bwo-timeline-heading">
        <strong>特性历程与版本交付</strong>
        <span title="Asia/Shanghai · UTC+08:00">北京时间 · 日历历时</span>
      </div>
      <div
        className="bwo-axis-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${feature.root.title}成果时间轴，可横向滚动`}
      >
        <div
          className="bwo-axis"
          style={
            {
              minWidth: width + 56,
              height: axisTop + 94,
              '--bwo-axis-top': `${axisTop}px`
            } as CSSProperties
          }
        >
          <div className="bwo-axis-scale">
            {cards.map((card) => (
              <Tooltip key={card.id}>
                <TooltipTrigger asChild>
                  <button
                    className={`bwo-version-delivery${!card.at ? ' future' : ''}`}
                    style={
                      {
                        left: percent(card.offset),
                        top: card.lane * 64,
                        '--bwo-label-shift': `${card.labelShift}px`,
                        '--bwo-connector-height': `${axisTop - card.lane * 64 - 54}px`
                      } as CSSProperties
                    }
                    aria-disabled={!card.url}
                    onClick={() => card.url && openEvidenceUrl(card.url)}
                  >
                    <strong>{card.label}</strong>
                    <time dateTime={card.at || undefined}>
                      {card.at
                        ? timeLabel(card.at)
                        : card.url
                          ? '合入时间未记录'
                          : '验收 PR 未记录'}
                    </time>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {card.at
                    ? '验收 PR · 已合入'
                    : card.url
                      ? '验收 PR · 合入时间未记录'
                      : '验收 PR · 未记录'}
                </TooltipContent>
              </Tooltip>
            ))}
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="bwo-timeline-marker"
                style={
                  {
                    left: percent(marker.offset),
                    top: cardHeight + marker.lane * 44,
                    '--bwo-label-shift': `${marker.labelShift}px`,
                    '--bwo-marker-height': `${axisTop - cardHeight - marker.lane * 44 - 36}px`
                  } as CSSProperties
                }
              >
                <strong>{marker.label}</strong>
                <time dateTime={marker.at}>{timeLabel(marker.at)}</time>
              </div>
            ))}
            {layout.slots.map((slot) => (
              <Tooltip key={slot.id}>
                <TooltipTrigger asChild>
                  <button
                    className={`bwo-stage-range ${slot.state}`}
                    style={{ left: percent(slot.offset), width: percent(slot.hours) }}
                    aria-label={`${slot.id}，${slot.hint}`}
                    data-stage={slot.id}
                    data-actual-start={slot.placeholder ? undefined : slot.start}
                    data-actual-end={slot.placeholder ? undefined : slot.end}
                    aria-disabled={!slot.source?.url}
                    onClick={() => slot.source?.url && openEvidenceUrl(slot.source.url)}
                  >
                    <strong>{slot.id}</strong>
                    <span>
                      {slot.placeholder
                        ? slot.state === 'done' || slot.state === 'unknown'
                          ? '历时未记录'
                          : `默认${slot.hours === 12 ? '半' : slot.hours / 24}天`
                        : (slot.ongoing ? '已 ' : '') + durationLabel(slot.duration!)}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{slot.hint}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
