import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
// Review-only geometry. Segment proportions are presentation, never measured stage timestamps.
export const dayMs = 86400000
export const day = (date) => Date.parse(`${date}T00:00:00Z`) / dayMs
export const dateOf = (value) => new Date(Math.round(value * dayMs)).toISOString().slice(0, 10)
export const phases = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain']
export const isRest = (value) => !workCalendarDay(dateOf(value)).working
export function proportionalStages(start, end, maintain = false) {
  const weights = maintain ? [1] : [0.2, 0.4, 0.1, 0.2, 0.1]
  let cursor = start
  return weights.map((weight, index) => {
    const next = index === weights.length - 1 ? end : cursor + (end - start) * weight
    const result = { phase: maintain ? 'Maintain' : phases[index], start: cursor, end: next }
    cursor = next
    return result
  })
}
export const defaultStages = (version, maintain = false) =>
  proportionalStages(day(version.start), day(version.end) + 1, maintain)
export function editVersionName(plan, id, name, previousName, submitted) {
  const version = plan.versions.find((v) => v.id === id)
  if (!version) {
    return { plan }
  }
  if (version.hasExecution) {
    return { plan, problem: '已建立执行记录的版本保留名称，排期仍可调整' }
  }
  if (previousName !== undefined && !name.trim()) {
    if (
      submitted.versions.some((v) => v.id === id) ||
      plan.features.some((f) => f.deliveries.some((d) => d.versionId === id))
    ) {
      return {
        plan: {
          ...plan,
          versions: plan.versions.map((v) => (v.id === id ? { ...v, name: previousName } : v))
        },
        problem: '该版本已有安排或已提交，请保留版本名称'
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
    f.deliveries.some((d, i) => {
      const p = f.deliveries[i - 1]
      return p && (p.versionId === d.versionId || d.stages[0].start < p.stages.at(-1).end - 1e-8)
    })
  )?.id
}
export function settleWindows(before, candidate) {
  for (let i = 0; i < candidate.versions.length; i++) {
    for (const b of candidate.versions.slice(i + 1)) {
      const a = candidate.versions[i],
        oldA = before.versions.find((v) => v.id === a.id),
        oldB = before.versions.find((v) => v.id === b.id)
      const parallel = oldA && oldB && oldA.start <= oldB.end && oldB.start <= oldA.end
      if (!parallel && a.start <= b.end && b.start <= a.end) {
        return { plan: before, conflict: '版本日期与已有安排重叠，请先调整相关版本' }
      }
    }
  }
  return { plan: candidate, conflict: scheduleProblem(candidate) }
}
export function adjustVersion(plan, id, mode, delta) {
  const v = plan.versions.find((v) => v.id === id)
  if (!v || !Number.isInteger(delta)) {
    return plan
  }
  const start = day(v.start) + (mode === 'move' || mode === 'start' ? delta : 0),
    end = day(v.end) + (mode === 'move' || mode === 'end' ? delta : 0)
  if (start > end) {
    return plan
  }
  return {
    ...plan,
    versions: plan.versions.map((v) =>
      v.id === id ? { ...v, start: dateOf(start), end: dateOf(end) } : v
    ),
    features:
      mode !== 'move'
        ? plan.features
        : plan.features.map((f) => ({
            ...f,
            deliveries: f.deliveries.map((d) =>
              d.versionId !== id
                ? d
                : {
                    ...d,
                    stages: d.stages.map((s) => ({
                      ...s,
                      start: s.start + delta,
                      end: s.end + delta
                    }))
                  }
            )
          }))
  }
}
export function adjustDelivery(plan, featureId, index, mode, delta, targetId) {
  const d = plan.features.find((f) => f.id === featureId)?.deliveries[index]
  const target = plan.versions.find((v) => v.id === (targetId || d?.versionId))
  if (!d?.stages.length || !target || !Number.isInteger(delta * 2)) {
    return plan
  }
  const first = d.stages[0].start,
    last = d.stages.at(-1).end
  const duration = last - first
  if (mode === 'move' && duration > day(target.end) + 1 - day(target.start)) {
    return plan
  }
  const start =
    mode === 'move'
      ? Math.max(day(target.start), Math.min(first + delta, day(target.end) + 1 - duration))
      : first + (mode === 'start' ? delta : 0)
  const end = mode === 'move' ? start + duration : last + (mode === 'end' ? delta : 0)
  if (end - start < 0.5) {
    return plan
  }
  const stages = d.stages.map((s) => ({
    ...s,
    start: start + ((s.start - first) * (end - start)) / (last - first),
    end: start + ((s.end - first) * (end - start)) / (last - first)
  }))
  return {
    ...plan,
    versions:
      mode === 'move'
        ? plan.versions
        : plan.versions.map((v) =>
            v.id === target.id
              ? {
                  ...v,
                  start: dateOf(Math.min(day(v.start), Math.floor(start))),
                  end: dateOf(Math.max(day(v.end), Math.ceil(end - 1e-8) - 1))
                }
              : v
          ),
    features: plan.features.map((f) =>
      f.id !== featureId
        ? f
        : {
            ...f,
            deliveries: f.deliveries.map((old, i) =>
              i !== index ? old : { versionId: target.id, stages }
            )
          }
    )
  }
}
export function scheduleProblem(plan) {
  for (const f of plan.features) {
    for (const d of f.deliveries) {
      const v = plan.versions.find((v) => v.id === d.versionId)
      if (!v) {
        return `${f.title} 的关联版本不存在`
      }
      if (
        d.stages.length &&
        (d.stages[0].start < day(v.start) - 1e-8 || d.stages.at(-1).end > day(v.end) + 1 + 1e-8)
      ) {
        return `${f.title} 的整段计划超出 ${v.name}，请调整版本边界`
      }
    }
  }
  return ''
}
