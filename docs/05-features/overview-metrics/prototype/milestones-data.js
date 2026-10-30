export const storageKey = 'bw-issue-440-prototype-v7'
export const currentDay = '2026-11-11'
export const fixedVersions = [
  { id: 'v1.0.0', name: 'v1.0.0', start: '2026-11-02', end: '2026-11-08' },
  { id: 'v1.0.1', name: 'v1.0.1', start: '2026-11-09', end: '2026-11-15' },
  { id: 'v1.1.0', name: 'v1.1.0', start: '2026-11-16', end: '2026-11-22' },
  { id: 'v1.1.1', name: 'v1.1.1', start: '2026-11-23', end: '2026-11-29' }
]
export const initial = {
  milestone: '协作与工程能力形成可用闭环',
  versions: fixedVersions,
  features: [
    {
      id: 'demo-notification',
      title: '消息与通知',
      owner: 'kanadead',
      pre: 'v1.0.0',
      release: 'v1.0.1'
    },
    {
      id: 'demo-metrics',
      title: '指标能力运维',
      owner: 'cfdcfd',
      pre: 'v1.0.0',
      release: 'v1.1.0'
    },
    {
      id: 'demo-engineering',
      title: '工程能力观测',
      owner: 'yuzhup',
      pre: 'v1.0.1',
      release: 'v1.1.0'
    },
    { id: 'demo-wall', title: '项目墙优化', owner: 'yuzhup', pre: 'v1.0.1', release: 'v1.1.1' },
    { id: 'demo-knowledge', title: '知识库', owner: 'cfdcfd', pre: 'v1.1.0', release: 'v1.1.1' },
    {
      id: 'demo-workflow',
      title: 'AI workflow',
      owner: 'kanadead',
      pre: 'v1.1.0',
      release: 'v1.1.1'
    }
  ]
}
export const clone = (value) => structuredClone(value)
export const versionIndex = (id) => fixedVersions.findIndex((v) => v.id === id)
export const versionName = (plan, id) =>
  plan.versions.find((v) => v.id === id)?.name || '未命名版本'
export function freshCases() {
  const empty = { milestone: '', versions: clone(fixedVersions), features: [] }
  return {
    existing: {
      draft: clone(initial),
      submitted: clone(initial),
      published: clone(initial),
      review: 'none'
    },
    empty: { draft: clone(empty), submitted: clone(empty), published: null, review: 'none' }
  }
}
export function validPlan(p) {
  return (
    p &&
    typeof p.milestone === 'string' &&
    Array.isArray(p.versions) &&
    p.versions.length === fixedVersions.length &&
    p.versions.every(
      (v, i) =>
        v.id === fixedVersions[i].id &&
        v.start === fixedVersions[i].start &&
        v.end === fixedVersions[i].end &&
        typeof v.name === 'string'
    ) &&
    Array.isArray(p.features) &&
    new Set(p.features.map((f) => f.id)).size === p.features.length &&
    p.features.every(
      (f) =>
        f &&
        ['id', 'title', 'owner'].every((k) => typeof f[k] === 'string') &&
        f.id &&
        versionIndex(f.pre) >= 0 &&
        versionIndex(f.pre) <= versionIndex(f.release)
    )
  )
}
export function loadCases() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (
      saved &&
      ['existing', 'empty'].every((key) => {
        const s = saved[key]
        return (
          s &&
          validPlan(s.draft) &&
          validPlan(s.submitted) &&
          (s.published === null || validPlan(s.published)) &&
          ['none', 'open', 'merged'].includes(s.review)
        )
      })
    ) {
      return saved
    }
  } catch {
    /* Save failures are exposed beside the board. */
  }
  return freshCases()
}
export function incomplete(plan) {
  if (!plan.milestone.trim()) {
    return '请填写旗帜旁的一句阶段成果'
  }
  if (plan.versions.some((v) => !v.name.trim())) {
    return '请补全版本名称'
  }
  if (plan.features.some((f) => !f.title.trim() || !f.owner.trim())) {
    return '请补全特性名称和负责人'
  }
  return ''
}
export function moveDelivery(plan, id, kind, target) {
  const old = plan.features.find((f) => f.id === id)
  if (!old || !['pre', 'release'].includes(kind) || versionIndex(target) < 0) {
    return { error: '这项安排无法移动。' }
  }
  const next = { ...old, [kind]: target }
  if (versionIndex(next.pre) > versionIndex(next.release)) {
    return { error: 'Pre版本不能晚于Release版本。' }
  }
  return { plan: { ...plan, features: plan.features.map((f) => (f.id === id ? next : f)) } }
}
export function changesBetween(before, after) {
  const changes = []
  const commonBefore = before.features
    .filter((f) => after.features.some((a) => a.id === f.id))
    .map((f) => f.id)
  const commonAfter = after.features
    .filter((f) => before.features.some((b) => b.id === f.id))
    .map((f) => f.id)
  if (JSON.stringify(commonBefore) !== JSON.stringify(commonAfter)) {
    changes.push({
      title: '特性顺序',
      detail: after.features.map((f) => f.title || '未命名特性').join(' → ')
    })
  }
  if (before.milestone !== after.milestone) {
    changes.push({
      title: '阶段成果',
      detail: `${before.milestone || '未填写'} → ${after.milestone || '未填写'}`
    })
  }
  for (const v of after.versions) {
    const old = before.versions.find((b) => b.id === v.id)
    if (old.name !== v.name) {
      changes.push({ title: '版本改名', detail: `${old.name} → ${v.name}` })
    }
  }
  for (const old of before.features) {
    if (!after.features.some((f) => f.id === old.id)) {
      changes.push({ title: `移除 ${old.title}`, detail: '从本次规划移除' })
    }
  }
  for (const f of after.features) {
    const old = before.features.find((b) => b.id === f.id)
    if (!old) {
      changes.push({
        title: `添加 ${f.title}`,
        detail: `${f.owner} · Pre ${versionName(after, f.pre)} → Release ${versionName(after, f.release)}`
      })
      continue
    }
    const parts = []
    if (old.title !== f.title) {
      parts.push(`名称：${old.title} → ${f.title}`)
    }
    if (old.owner !== f.owner) {
      parts.push(`负责人：${old.owner} → ${f.owner}`)
    }
    for (const kind of ['pre', 'release']) {
      if (old[kind] !== f[kind]) {
        parts.push(
          `${kind === 'pre' ? 'Pre' : 'Release'}：${versionName(before, old[kind])} → ${versionName(after, f[kind])}`
        )
      }
    }
    if (parts.length) {
      changes.push({ title: f.title, detail: parts.join('；') })
    }
  }
  return changes
}
export function calendarDays(month = 11) {
  return Array.from({ length: new Date(Date.UTC(2026, month, 0)).getUTCDate() }, (_, i) => {
    const day = i + 1,
      date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(),
      overtime = day === (month === 10 ? 17 : 14)
    return { date, day, weekday, overtime, work: overtime || (weekday > 0 && weekday < 6) }
  })
}
