import { AnnotationMarkers } from './annotations/annotation-markers'
import { annotationAttributes, type AnnotationRef } from './annotations/types'
import type { MetricDefinition, MetricReading } from '../../../shared/workbench/metrics'
import { targetVerdict, type TargetVerdict } from './overview-scoreboard-model'
import { zonePointState, type zoneChartRange } from './overview-zone-series'

export type MeasureView = {
  valueText: string
  unknown: boolean
  values: (number | null)[]
  latestNumber: number | null
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
    const { value } = state.latest
    return {
      valueText: typeof value === 'number' ? `${value}${def.unit}` : value,
      unknown: false,
      values: state.values,
      latestNumber: typeof value === 'number' ? value : null
    }
  }
  return {
    valueText: busy && state.kind !== 'ready' ? '读取中' : '未知',
    unknown: true,
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
      </div>
    )
  }
  const verdict = target ? verdictOf(def, target, view) : null
  const tone = view.unknown ? 'unknown' : verdict
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
        <div className="wb-sb-figure">
          <div className={tone ? `wb-sb-num wb-sb-num-${tone}` : 'wb-sb-num'}>{view.valueText}</div>
          {target && <span className="wb-sb-finish">{target}</span>}
        </div>
      </div>
      <Trend name={def.name} labels={labels} values={view.values} />
    </div>
  )
}
