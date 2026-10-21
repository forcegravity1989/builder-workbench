import { metrics } from '../../version-planning/prototype/snapshot.js'

const sampleWindow = { since: '2026-09-21', until: '2026-09-28', granularity: 'week' }
export function acceptanceMetric(goal) {
  return metrics.find((item) => item.id === (goal.acceptanceMetricId ?? goal.metricId))
}
export function acceptanceWindow(goal) {
  return goal.acceptanceMetricWindow ?? sampleWindow
}
