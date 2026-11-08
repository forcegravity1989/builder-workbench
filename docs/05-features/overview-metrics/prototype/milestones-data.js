import { defaultStages, day, dateOf, scheduleProblem } from './milestones-sdlc.js'
export const dateExample = new URLSearchParams(window.location.search).get('example') === 'dates'
export const storageKey = `bw-issue-590-free-timeline-v1${dateExample ? '-dates' : ''}`
export const currentDay = '2026-11-06'
export const fixedVersions = [
  { id: 'v1.0.0', hasExecution: true, name: 'v1.0.0', start: '2026-11-02', end: '2026-11-11' },
  { id: 'v1.0.1', hasExecution: true, name: 'v1.0.1', start: '2026-11-12', end: '2026-11-18' },
  { id: 'v1.1.0', hasExecution: true, name: 'v1.1.0', start: '2026-11-19', end: '2026-11-25' },
  { id: 'v1.1.1', hasExecution: true, name: 'v1.1.1', start: '2026-11-26', end: '2026-12-02' }
]
const span = (phase, start, end) => ({
  id: phase + '-' + start,
  stages: [{ phase, start: day(start), end: day(end) + 1 }]
})
const normalInitial = {
  months: [],
  milestones: [
    { id: 'demo-feedback', date: '2026-10-30', outcome: '完成首轮用户反馈回收' },
    { id: 'demo-launch', date: '2026-11-15', outcome: '发布 1.0，完成首次正式推广' }
  ],
  versions: [
    { id: 'v0.9', name: 'v0.9', hasExecution: true, start: '2026-10-26', end: '2026-11-01' },
    ...fixedVersions
  ],
  features: [
    {
      id: 'demo-wall',
      title: '项目墙优化',
      owner: 'yuzhup',
      deliveries: [
        span('Build', '2026-10-19', '2026-11-10'),
        span('Maintain', '2026-11-11', '2026-11-17')
      ]
    },
    {
      id: 'demo-notification',
      title: '消息与通知',
      owner: 'kanadead',
      deliveries: [
        span('Build', '2026-10-26', '2026-11-18'),
        span('Maintain', '2026-11-19', '2026-11-25')
      ]
    },
    {
      id: 'demo-metrics',
      title: '指标能力运维',
      owner: 'cfdcfd',
      deliveries: [
        span('Build', '2026-10-05', '2026-10-09'),
        span('Maintain', '2026-10-12', '2026-10-16'),
        span('Maintain', '2026-11-09', '2026-11-13')
      ]
    },
    {
      id: 'demo-knowledge',
      title: '知识库',
      owner: '',
      deliveries: [
        span('Build', '2026-11-02', '2026-11-13'),
        span('Maintain', '2026-11-14', '2026-11-20')
      ]
    },
    {
      id: 'demo-engineering',
      title: '工程能力观测',
      owner: 'yuzhup',
      deliveries: [
        span('Build', '2026-10-05', '2026-10-16'),
        span('Maintain', '2026-10-17', '2026-10-23'),
        span('Maintain', '2026-11-02', '2026-11-08')
      ]
    },
    {
      id: 'demo-workflow',
      title: 'AI workflow',
      owner: 'kanadead',
      deliveries: [
        span('Build', '2026-10-05', '2026-10-09'),
        span('Maintain', '2026-10-12', '2026-10-16')
      ]
    }
  ].map((f) => ({ ...f, month: '2026-11' }))
}

// A separate review fixture preserves the user's existing planning draft.
const dateVersions = fixedVersions.slice(0, 2).map((v, i) => ({
  ...v,
  start: i ? '2026-11-07' : '2026-11-01',
  end: i ? '2026-11-11' : '2026-11-05'
}))
export const initial = dateExample
  ? {
      ...normalInitial,
      versions: dateVersions,
      features: normalInitial.features.slice(0, 2).map((f) => ({
        ...f,
        deliveries: dateVersions.map((v, i) => ({
          id: 'dates-' + i,
          stages: defaultStages(v, i === 1)
        }))
      }))
    }
  : normalInitial

// Explicit local samples, not repository facts. Goal membership is supplied by a fixed version plan.
const roots = [
  { number: 901, title: '【v1.0.0|G1】项目墙优化', labels: ['特性'] },
  { number: 902, title: '【v1.0.0|G2】消息与通知', labels: ['特性'] },
  { number: 903, title: '【v1.0.1|G2】指标能力运维', labels: ['特性'] },
  { number: 904, title: '【v1.1.0|G2】知识库', labels: ['特性'] },
  { number: 905, title: '【v1.1.0|G3】工程能力观测', labels: ['特性'] }
]
const records = dateExample
  ? [
      {
        version: { ...dateVersions[0], end: '2026-11-10' },
        merged: true,
        tasks: [
          { number: 901, goalId: 'G1' },
          { number: 902, goalId: 'G2' }
        ],
        results: { G1: 'met', G2: 'not-met' }
      }
    ]
  : [
      {
        version: fixedVersions[0],
        merged: true,
        tasks: [
          { number: 901, goalId: 'G1' },
          { number: 902, goalId: 'G2' }
        ],
        results: { G1: 'not-met', G2: 'met' }
      },
      {
        version: fixedVersions[1],
        merged: true,
        tasks: [
          { number: 901, goalId: 'G1' },
          { number: 903, goalId: 'G2' },
          { number: 902, goalId: 'G3' }
        ],
        results: { G1: 'met', G2: 'not-met', G3: 'met' }
      },
      {
        version: fixedVersions[2],
        merged: true,
        tasks: [
          { number: 901, goalId: 'G1' },
          { number: 904, goalId: 'G2' },
          { number: 905, goalId: 'G3' }
        ],
        results: { G1: 'not-met', G2: 'unknown', G3: 'met' }
      },
      {
        version: fixedVersions[3],
        merged: false,
        tasks: [
          { number: 901, goalId: 'G1' },
          { number: 905, goalId: 'G2' }
        ],
        results: { G1: 'met', G2: 'met' }
      }
    ]
export const actualVersions = records.map((record) => record.version)
export function sampleActual(feature, scenario = 'normal') {
  if (scenario === 'unlinked') {
    return { rows: [], note: '未关联特性' }
  }
  if (scenario === 'ambiguous') {
    return { rows: [], note: '特性匹配不唯一' }
  }
  if (scenario === 'error') {
    return { rows: [], note: '验收读取失败' }
  }
  const candidates = roots.filter(
    (r) =>
      r.labels.includes('特性') && feature.title.trim() && r.title.includes(feature.title.trim())
  )
  if (candidates.length !== 1) {
    return { rows: [], note: '未关联特性' }
  }
  const root = candidates[0]
  let delivered = false
  const rows = []
  for (const record of records) {
    const refs = record.tasks.filter((t) => t.number === root.number)
    if (refs.length !== 1) {
      continue
    }
    const outcome = record.merged ? record.results[refs[0].goalId] : 'pending'
    // Unknown or unmerged results never count as success or failure.
    if (!['met', 'not-met'].includes(outcome)) {
      continue
    }
    const maintain = delivered
    rows.push({
      versionId: record.version.id,
      version: record.version,
      kind: maintain ? 'Maintain' : '开发',
      outcome,
      goalId: refs[0].goalId,
      number: root.number
    })
    if (outcome === 'met') {
      delivered = true
    }
  }
  return { rows, note: rows.length ? '' : '暂无已归档结果' }
}
export const clone = (value) => structuredClone(value)
export function freshCases() {
  const empty = { months: [], milestones: [], versions: [], features: [] }
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
    (!p.milestones ||
      (Array.isArray(p.milestones) &&
        p.milestones.every(
          (m) =>
            m.id &&
            typeof m.outcome === 'string' &&
            (m.date ? Number.isFinite(Date.parse(m.date)) : /^\d{4}-\d{2}$/.test(m.month))
        ))) &&
    Array.isArray(p.months) &&
    p.months.every(
      (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && typeof m.outcome === 'string'
    ) &&
    Array.isArray(p.versions) &&
    p.versions.every(
      (v) =>
        v.id &&
        typeof v.name === 'string' &&
        Number.isFinite(Date.parse(v.start)) &&
        v.start <= v.end
    ) &&
    Array.isArray(p.features) &&
    new Set(p.features.map((f) => f.id)).size === p.features.length &&
    p.features.every(
      (f) =>
        f &&
        ['id', 'title', 'owner'].every((k) => typeof f[k] === 'string') &&
        f.id &&
        Array.isArray(f.deliveries) &&
        f.deliveries.every(
          (d) =>
            Array.isArray(d.stages) &&
            d.stages.every(
              (s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start < s.end
            )
        )
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
      for (const state of Object.values(saved)) {
        for (const key of ['draft', 'submitted', 'published']) {
          const plan = state[key]
          if (plan && !plan.milestones) {
            plan.milestones = plan.months
              .filter((m) => m.outcome.trim())
              .map((m) => ({ ...m, id: `month-${m.month}`, date: '' }))
            plan.months = []
          }
        }
      }
      return saved
    }
  } catch {
    /* Save failures are exposed beside the board. */
  }
  return freshCases()
}
export function incomplete(plan) {
  if (plan.milestones.some((m) => !m.outcome.trim())) {
    return '请补全里程碑成果'
  }
  if (plan.versions.some((v) => !v.name.trim())) {
    return '请补全版本名称'
  }
  if (plan.features.some((f) => !f.title.trim())) {
    return '填写特性名称后再提交评审'
  }
  return scheduleProblem(plan)
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
  for (const m of after.milestones) {
    const old = before.milestones.find((item) => item.id === m.id)
    if (!old || old.date !== m.date || old.outcome !== m.outcome) {
      changes.push({
        title: old ? '调整里程碑' : '添加里程碑',
        detail: `${old ? `${old.date || old.month} ${old.outcome} → ` : ''}${m.date || m.month} ${m.outcome}`
      })
    }
  }
  for (const old of before.milestones) {
    if (!after.milestones.some((m) => m.id === old.id)) {
      changes.push({ title: '删除里程碑', detail: `${old.date || old.month} ${old.outcome}` })
    }
  }
  for (const v of after.versions) {
    const old = before.versions.find((b) => b.id === v.id)
    if (!old) {
      changes.push({ title: '登记版本', detail: `${v.name} · ${v.start} — ${v.end}` })
      continue
    }
    if (old.start !== v.start || old.end !== v.end) {
      changes.push({
        title: `${v.name} 排期`,
        detail: `${old.start} — ${old.end} → ${v.start} — ${v.end}`
      })
    }
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
        detail: `${f.owner || '未指定负责人'} · ${f.deliveries.map((d) => d.stages[0].phase).join(' → ')}`
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
    if (JSON.stringify(old.deliveries) !== JSON.stringify(f.deliveries)) {
      parts.push(
        `时间安排：${f.deliveries.map((d) => `${d.stages[0]?.phase} ${dateOf(d.stages[0].start)}—${dateOf(Math.ceil(d.stages.at(-1).end) - 1)}`).join('；')}`
      )
    }
    if (parts.length) {
      changes.push({ title: f.title, detail: parts.join('；') })
    }
  }
  return changes
}
