import { AnnotationMarkers } from './annotations/annotation-markers'
import { annotationAttributes, type AnnotationRef } from './annotations/types'
import type { MetricDefinition, MetricReading } from '../../../shared/workbench/metrics'
import { targetVerdict, type TargetVerdict } from './overview-scoreboard-model'
import { zonePointState, type zoneChartRange } from './overview-zone-series'

export const VERDICT_TEXT: Record<'met' | 'unmet' | 'unknown', string> = {
  met: '已达完成线',
  unmet: '未达完成线',
  unknown: '看不出输赢'
}

export type MeasureView = {
  valueText: string
  unknown: boolean
  statusText: string
  values: (number | null)[]
  latestNumber: number | null
}

function collectedText(iso: string, timezone: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(at)
}

export function measureView(
  def: MetricDefinition,
  readings: Record<string, MetricReading | null>,
  labels: string[],
  range: ReturnType<typeof zoneChartRange>,
  timezone: string,
  busy: boolean
): MeasureView {
  const state = zonePointState(readings[def.ref.definitionHash] ?? null, labels, range, timezone)
  if (state.kind === 'ready' && state.latest) {
    const { value, collectedAt } = state.latest
    return {
      valueText: typeof value === 'number' ? `${value}${def.unit}` : value,
      unknown: false,
      statusText: `采集于 ${collectedText(collectedAt, timezone)}`,
      values: state.values,
      latestNumber: typeof value === 'number' ? value : null
    }
  }
  return {
    valueText: busy && state.kind !== 'ready' ? '读取中' : '未知',
    unknown: true,
    statusText:
      busy && state.kind !== 'ready'
        ? '正在读取…'
        : state.kind === 'unknown'
          ? state.stale
            ? `${state.message} · 陈旧读数 ${state.stale.value}（采集于 ${collectedText(state.stale.collectedAt, timezone)}）`
            : state.message
          : state.kind === 'unread'
            ? '未读取'
            : '本窗口无读数',
    values: state.kind === 'ready' ? state.values : labels.map(() => null),
    latestNumber: null
  }
}

function verdictOf(def: MetricDefinition, target: string, view: MeasureView): TargetVerdict {
  return view.latestNumber === null ? null : targetVerdict(target, view.latestNumber, def.unit)
}

export function scoreboardVerdict(
  def: MetricDefinition,
  target: string,
  view: MeasureView
): 'met' | 'unmet' | 'unknown' {
  return verdictOf(def, target, view) ?? 'unknown'
}

function shortLabel(label: string): string {
  return label.replace(/^\d{4}-/, '')
}

function Trend({
  name,
  labels,
  values
}: {
  name: string
  labels: string[]
  values: (number | null)[]
}) {
  const max = Math.max(...values.map((value) => Math.abs(value ?? 0)), 0)
  return (
    <div className="wb-sb-trend" aria-label={`${name} 走势`}>
      {values.map((value, index) => (
        <div
          key={labels[index]}
          className={[
            'wb-sb-bar',
            index === values.length - 1 && 'wb-sb-bar-now',
            value === null && 'wb-sb-bar-none'
          ]
            .filter(Boolean)
            .join(' ')}
          title={`${labels[index]}：${value ?? '无读数'}`}
        >
          <i
            style={{
              height: value === null || max === 0 ? 4 : Math.max(4, (Math.abs(value) / max) * 44)
            }}
          />
          <span>{shortLabel(labels[index])}</span>
        </div>
      ))}
    </div>
  )
}

export function metricNote(scene: string, name: string): AnnotationRef {
  return { kind: 'metrics', goalId: `${scene}/${name}`, label: `${scene} · ${name}` }
}

export function Measure({
  role,
  def,
  target,
  view,
  labels,
  note,
  noteNumbers,
  onOpenNotes
}: {
  role: '结果' | '引领'
  def: MetricDefinition | null
  target: string | undefined
  view: MeasureView | null
  labels: string[]
  note: AnnotationRef | null
  noteNumbers: number[]
  onOpenNotes(): void
}) {
  if (!def || !view) {
    return (
      <div className="wb-sb-measure wb-sb-measure-empty">
        <div className="wb-sb-role">{role}</div>
        <div className="wb-sb-name wb-muted">还没有{role}指标</div>
        <p className="wb-sb-def">
          用「配置指标」新建会话，给这个场景配一条可按周采集的{role}指标。
        </p>
      </div>
    )
  }
  const verdict = target ? verdictOf(def, target, view) : null
  return (
    <div className="wb-sb-measure" {...(note ? annotationAttributes(note) : {})}>
      <div className="wb-sb-main">
        <div className="wb-sb-role">{role}</div>
        <div className="wb-sb-name">
          {def.name}
          {note && (
            <AnnotationMarkers numbers={noteNumbers} label={note.label} onOpenPanel={onOpenNotes} />
          )}
        </div>
        <div className={view.unknown ? 'wb-sb-num wb-sb-num-unknown' : 'wb-sb-num'}>
          {view.valueText}
        </div>
        <div className="wb-sb-status">
          {target ? (
            <>
              <i className={`wb-sb-dot wb-sb-dot-${verdict ?? 'unknown'}`} aria-hidden="true" />
              <span>{VERDICT_TEXT[verdict ?? 'unknown']}</span>
              <span className="wb-muted">· 完成线 {target}</span>
            </>
          ) : (
            <span className="wb-muted">{view.statusText}</span>
          )}
        </div>
        {target && <div className="wb-sb-status wb-muted">{view.statusText}</div>}
      </div>
      <Trend name={def.name} labels={labels} values={view.values} />
      <p className="wb-sb-def">{def.def}</p>
    </div>
  )
}
