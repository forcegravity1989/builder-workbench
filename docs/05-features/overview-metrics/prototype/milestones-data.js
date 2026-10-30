import { defaultStages, dateOf, scheduleProblem } from './milestones-sdlc.js'
export const storageKey = 'bw-issue-440-prototype-sdlc-v1'
export const currentDay = '2026-11-11'
export const fixedVersions = [
  { id: 'v1.0.0', name: 'v1.0.0', start: '2026-11-02', end: '2026-11-06', started: true },
  { id: 'v1.0.1', name: 'v1.0.1', start: '2026-11-09', end: '2026-11-13', started: true },
  { id: 'v1.1.0', name: 'v1.1.0', start: '2026-11-16', end: '2026-11-20' },
  { id: 'v1.1.1', name: 'v1.1.1', start: '2026-11-23', end: '2026-11-27' }
]
// These are explicit demonstration associations, never matched by feature title.
const delivery = (index, maintain = false) => ({
  versionId: fixedVersions[index].id,
  stages: defaultStages(fixedVersions[index], maintain)
})
const completed = [
  {
    phase: 'Plan',
    startAt: '2026-11-02T09:00:00+08:00',
    endAt: '2026-11-03T10:20:00+08:00',
    source: '版本计划 PR 合入；起点为约定的周一 09:00'
  },
  {
    phase: 'Design',
    startAt: '2026-11-03T10:20:00+08:00',
    endAt: '2026-11-04T14:40:00+08:00',
    source: '明确关联的设计 PR 合入'
  },
  {
    phase: 'Build',
    startAt: '2026-11-04T14:40:00+08:00',
    endAt: '2026-11-04T17:10:00+08:00',
    source: '明确关联的实现 PR 合入'
  },
  {
    phase: 'Test',
    startAt: '2026-11-04T17:10:00+08:00',
    endAt: '2026-11-06T11:30:00+08:00',
    source: '版本验收 PR 合入，关联目标人工通过'
  }
]
const running = [
  {
    phase: 'Plan',
    startAt: '2026-11-09T09:00:00+08:00',
    endAt: '2026-11-10T10:15:00+08:00',
    source: '版本计划 PR 合入；起点为约定的周一 09:00'
  },
  {
    phase: 'Design',
    startAt: '2026-11-10T10:15:00+08:00',
    endAt: '2026-11-11T14:20:00+08:00',
    source: '明确关联的设计 PR 合入'
  },
  {
    phase: 'Build',
    startAt: '2026-11-11T14:20:00+08:00',
    endAt: null,
    source: '尚无实现 PR 合入或可用 Issue 关闭证据'
  }
]
export const initial = {
  months: [{ month: '2026-11', outcome: '协作与工程能力形成可用闭环' }],
  versions: fixedVersions,
  features: [
    {
      id: 'demo-notification',
      title: '消息与通知',
      owner: 'kanadead',
      deliveries: [
        { ...delivery(0), actual: completed },
        {
          ...delivery(1, true),
          actual: [
            {
              phase: 'Maintain',
              startAt: '2026-11-09T10:15:00+08:00',
              endAt: null,
              source: '后续版本计划明确纳入跟进；尚未验收'
            }
          ]
        }
      ]
    },
    {
      id: 'demo-metrics',
      title: '指标能力运维',
      owner: 'cfdcfd',
      deliveries: [{ ...delivery(1), actual: running }, delivery(2, true)]
    },
    {
      id: 'demo-engineering',
      title: '工程能力观测',
      owner: 'yuzhup',
      deliveries: [{ ...delivery(1), actual: [] }, delivery(2, true)]
    },
    {
      id: 'demo-wall',
      title: '项目墙优化',
      owner: 'yuzhup',
      deliveries: [delivery(2), delivery(3, true)]
    },
    {
      id: 'demo-knowledge',
      title: '知识库',
      owner: 'cfdcfd',
      deliveries: [delivery(2), delivery(3, true)]
    },
    {
      id: 'demo-workflow',
      title: 'AI workflow',
      owner: 'kanadead',
      deliveries: [delivery(2), delivery(3, true)]
    }
  ].map((f, i) => ({
    ...f,
    month: '2026-11',
    deliveries: f.deliveries.map((d) => ({
      ...d,
      goalSlot: (i % 4) + 1,
      actualGoalSlot: (i % 4) + 1
    }))
  }))
}
export const clone = (value) => structuredClone(value)
export const versionName = (plan, id) =>
  plan.versions.find((v) => v.id === id)?.name || '未命名版本'
export function freshCases() {
  const empty = { months: [{ month: '2026-11', outcome: '' }], versions: [], features: [] }
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
            p.versions.some((v) => v.id === d.versionId) &&
            Array.isArray(d.stages) &&
            d.stages.length &&
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
      return saved
    }
  } catch {
    /* Save failures are exposed beside the board. */
  }
  return freshCases()
}
export function incomplete(plan) {
  if (plan.versions.some((v) => !v.name.trim())) {
    return '请补全版本名称'
  }
  if (plan.features.some((f) => !f.title.trim() || !f.owner.trim())) {
    return '请补全特性名称和负责人'
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
  for (const m of after.months) {
    const old = before.months.find((item) => item.month === m.month)
    if (!old || old.outcome !== m.outcome) {
      changes.push({
        title: `${m.month} 阶段成果`,
        detail: `${old?.outcome || '未填写'} → ${m.outcome || '未填写'}`
      })
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
        detail: `${f.owner} · ${f.deliveries.map((d) => versionName(after, d.versionId)).join(' → ')}`
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
    f.deliveries.forEach((delivery, index) => {
      const previous = old.deliveries[index]
      if (previous && previous.goalSlot !== delivery.goalSlot) {
        parts.push(
          `${versionName(after, delivery.versionId)} 目标：${previous.goalSlot ? `G${previous.goalSlot}` : '未选目标'} → ${delivery.goalSlot ? `G${delivery.goalSlot}` : '未选目标'}`
        )
      }
    })
    if (JSON.stringify(old.deliveries) !== JSON.stringify(f.deliveries)) {
      parts.push(
        `SDLC 排期：${f.deliveries.map((d) => `${versionName(after, d.versionId)} ${d.stages.map((s) => `${s.phase} ${dateOf(s.start)} ${s.start % 1 ? '下午' : '上午'}—${dateOf(s.end)} ${s.end % 1 ? '下午' : '上午'}`).join(' / ')}`).join('；')}`
      )
    }
    if (parts.length) {
      changes.push({ title: f.title, detail: parts.join('；') })
    }
  }
  return changes
}
