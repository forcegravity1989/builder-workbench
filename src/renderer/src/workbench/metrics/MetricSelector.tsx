import {
  metricRefKey,
  type MetricDefinition,
  type MetricRef
} from '../../../../shared/workbench/metrics'
import './metric-evidence.css'
const NO_SELECTION: readonly MetricRef[] = []

export function MetricSelector({
  definitions,
  selected = NO_SELECTION,
  label,
  disabled = false,
  onSelect
}: {
  definitions: readonly MetricDefinition[]
  selected?: readonly MetricRef[]
  label: string
  disabled?: boolean
  onSelect(definition: MetricDefinition): void
}) {
  const selectedKeys = new Set(selected.map(metricRefKey))
  const available = definitions.filter((item) => !selectedKeys.has(metricRefKey(item.ref)))
  const features = [...new Set(available.map((item) => item.feature))]
  return (
    <select
      className="wb-metric-selector"
      aria-label={label}
      value=""
      disabled={disabled || available.length === 0}
      onChange={(event) => {
        const definition = available.find((item) => metricRefKey(item.ref) === event.target.value)
        if (definition) {
          onSelect(definition)
        }
      }}
    >
      <option value="">{available.length ? '选择业务指标' : '暂无可选指标'}</option>
      {features.map((feature) => (
        <optgroup key={feature} label={feature || '主要'}>
          {available
            .filter((item) => item.feature === feature)
            .map((item) => (
              <option key={metricRefKey(item.ref)} value={metricRefKey(item.ref)} title={item.def}>
                {item.name}
                {item.collect.retro ? '' : '（仅当前值）'}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}
