import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
// Review-only date planning. Formal version membership remains in version plans.
export const dayMs = 86400000
export const day = (date) => Date.parse(`${date}T00:00:00Z`) / dayMs
export const dateOf = (value) => new Date(Math.round(value * dayMs)).toISOString().slice(0, 10)
export const phases = ['Build', 'Maintain']
export const isRest = (value) => !workCalendarDay(dateOf(value)).working
export const defaultStages = (version, maintain = false) => [
  { phase: maintain ? 'Maintain' : 'Build', start: day(version.start), end: day(version.end) + 1 }
]
export function editVersionName(plan, id, name, previousName, submitted) {
  const version = plan.versions.find((v) => v.id === id)
  if (!version) {
    return { plan }
  }
  if (version.hasExecution) {
    return { plan, problem: '已建立执行记录的版本保留名称，排期仍可调整' }
  }
  if (previousName !== undefined && !name.trim()) {
    if (submitted.versions.some((v) => v.id === id)) {
      return {
        plan: {
          ...plan,
          versions: plan.versions.map((v) => (v.id === id ? { ...v, name: previousName } : v))
        },
        problem: '该版本已提交，保留版本名称'
      }
    }
    return { plan: { ...plan, versions: plan.versions.filter((v) => v.id !== id) } }
  }
  return {
    plan: { ...plan, versions: plan.versions.map((v) => (v.id === id ? { ...v, name } : v)) }
  }
}
export function laneConflict(plan) {
  return plan.features.find((f) =>
    f.deliveries
      .toSorted((a, b) => a.stages[0].start - b.stages[0].start)
      .some((d, i, all) => {
        const previous = all[i - 1]
        return previous && d.stages[0].start < previous.stages.at(-1).end - 1e-8
      })
  )?.id
}
export function settleWindows(before, candidate) {
  const conflict = scheduleProblem(candidate)
  return { plan: conflict ? before : candidate, conflict }
}
export function adjustVersion(plan, id, mode, delta) {
  const version = plan.versions.find((v) => v.id === id)
  if (!version || !Number.isInteger(delta)) {
    return plan
  }
  const start = day(version.start) + (mode !== 'end' ? delta : 0)
  const end = day(version.end) + (mode !== 'start' ? delta : 0)
  if (start > end) {
    return plan
  }
  return {
    ...plan,
    versions: plan.versions.map((v) =>
      v.id === id ? { ...v, start: dateOf(start), end: dateOf(end) } : v
    )
  }
}
export function adjustDelivery(plan, featureId, index, mode, delta) {
  const feature = plan.features.find((f) => f.id === featureId)
  const delivery = feature?.deliveries[index]
  if (!delivery?.stages.length || !Number.isInteger(delta * 2)) {
    return plan
  }
  const first = delivery.stages[0],
    last = delivery.stages.at(-1)
  const start = first.start + (mode !== 'end' ? delta : 0)
  const end = last.end + (mode !== 'start' ? delta : 0)
  if (end - start < 0.5) {
    return plan
  }
  const deliveries = feature.deliveries.map((d, i) =>
    i === index ? { ...d, stages: [{ phase: first.phase, start, end }] } : d
  )
  // Extending Build carries following maintenance forward as one undoable edit.
  if (first.phase === 'Build' && end > last.end) {
    let cursor = end
    const later = feature.deliveries
      .filter(
        (d) =>
          d.id !== delivery.id &&
          d.stages[0].phase === 'Maintain' &&
          d.stages[0].start >= first.start
      )
      .toSorted((a, b) => a.stages[0].start - b.stages[0].start)
    for (const next of later) {
      if (next.stages.at(-1).end <= start) {
        continue
      }
      const offset = cursor - next.stages[0].start
      if (offset <= 0) {
        break
      }
      const shifted = {
        ...next,
        stages: next.stages.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset }))
      }
      deliveries[deliveries.findIndex((d) => d.id === next.id)] = shifted
      cursor = shifted.stages.at(-1).end
    }
  }
  return {
    ...plan,
    features: plan.features.map((f) => (f.id === featureId ? { ...f, deliveries } : f))
  }
}
export function scheduleProblem(plan) {
  for (let i = 0; i < plan.versions.length; i++) {
    for (const b of plan.versions.slice(i + 1)) {
      const a = plan.versions[i]
      if (a.start <= b.end && b.start <= a.end) {
        return '版本日期重叠，请调整相关版本'
      }
    }
  }
  for (const feature of plan.features) {
    if (
      feature.deliveries.some(
        (d) =>
          !d.stages.length ||
          d.stages.some(
            (s) =>
              !phases.includes(s.phase) ||
              !Number.isFinite(s.start) ||
              !Number.isFinite(s.end) ||
              s.end - s.start < 0.5
          )
      )
    ) {
      return `${feature.title || '新特性'}的安排至少保留半天`
    }
  }
  return laneConflict(plan) ? '同一特性的安排不能重叠，调整开始或结束日期' : ''
}
export const latestFeatureEnd = (feature) =>
  Math.max(-Infinity, ...feature.deliveries.flatMap((d) => d.stages.map((s) => s.end)))
