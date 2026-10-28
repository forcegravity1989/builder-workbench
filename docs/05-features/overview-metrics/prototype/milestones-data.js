export const storageKey = 'bw-issue-440-prototype-v5'
export const currentDay = '2026-11-11'
export const fixedVersions = [
  { id: 'v1.0.0', start: '2026-11-02', end: '2026-11-08', target: '2026-11-06' },
  { id: 'v1.0.1', start: '2026-11-09', end: '2026-11-15', target: '2026-11-13' },
  { id: 'v1.1.0', start: '2026-11-16', end: '2026-11-22', target: '2026-11-20' },
  { id: 'v1.1.1', start: '2026-11-23', end: '2026-11-29', target: '2026-11-27' }
]
export const versionById = Object.fromEntries(fixedVersions.map((v) => [v.id, v]))
export const versionIndex = (id) => fixedVersions.findIndex((v) => v.id === id)
export const initial = {
  milestone: {
    title: '协作与工程能力形成可用闭环',
    outcome: '消息可触达、指标可运维、工程可观测，项目墙、知识库与 AI workflow 接入团队日常使用。'
  },
  requirements: [
    {
      id: 'demo-notification',
      title: '消息与通知',
      owner: 'kanadead',
      priority: 1,
      included: true,
      pre: 'v1.0.0',
      release: 'v1.0.1',
      due: '2026-11-13',
      preScope: '重要工作事件能通知到少量内部试用者。',
      releaseScope: '通知可定位回原对象，失败与遗漏有处理去处。'
    },
    {
      id: 'demo-metrics',
      title: '指标能力运维',
      owner: 'cfdcfd',
      priority: 1,
      included: true,
      pre: 'v1.0.0',
      release: 'v1.1.0',
      due: '2026-11-20',
      preScope: '看清一次指标采集的来源、结果和失败。',
      releaseScope: '真实使用中能发现采集异常并恢复，不以缺数冒充正常。'
    },
    {
      id: 'demo-engineering',
      title: '工程能力观测',
      owner: 'yuzhup',
      priority: 1,
      included: true,
      pre: 'v1.0.1',
      release: 'v1.1.0',
      due: '2026-11-20',
      preScope: '从项目进入实际流水线与检查结果。',
      releaseScope: '跨项目核对工程事实，并进入相应工作对象处理问题。'
    },
    {
      id: 'demo-wall',
      title: '项目墙优化',
      owner: 'yuzhup',
      priority: 2,
      included: true,
      pre: 'v1.0.1',
      release: 'v1.1.1',
      due: '2026-11-27',
      preScope: '团队试用项目定位与进入路径。',
      releaseScope: '依据试用修理项目查找、切换和信息辨识。'
    },
    {
      id: 'demo-knowledge',
      title: '知识库',
      owner: 'cfdcfd',
      priority: 2,
      included: true,
      pre: 'v1.1.0',
      release: 'v1.1.1',
      due: '2026-11-27',
      preScope: '从一项真实任务找到所需的项目知识。',
      releaseScope: '常用知识可定位和维护，来源与未确认内容可辨。'
    },
    {
      id: 'demo-workflow',
      title: 'AI workflow',
      owner: 'kanadead',
      priority: 2,
      included: true,
      pre: 'v1.1.0',
      release: 'v1.1.1',
      due: '2026-11-27',
      preScope: '一条项目已有 workflow 能真实走完并回看。',
      releaseScope: '依据实际使用修理中断和返工，任务结果仍沿 Issue 处理。'
    }
  ]
}
export function validRequirement(r) {
  const v = versionById[r?.release]
  return (
    r &&
    typeof r.id === 'string' &&
    ['title', 'owner'].every((k) => typeof r[k] === 'string' && r[k].trim()) &&
    ['preScope', 'releaseScope'].every((k) => typeof r[k] === 'string') &&
    [1, 2, 3].includes(r.priority) &&
    typeof r.included === 'boolean' &&
    versionIndex(r.pre) >= 0 &&
    versionIndex(r.pre) <= versionIndex(r.release) &&
    /^2026-11-(0[1-9]|[12]\d|30)$/.test(r.due) &&
    r.due >= v.start &&
    r.due <= v.end
  )
}
export function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (
      saved?.milestone &&
      ['title', 'outcome'].every(
        (k) => typeof saved.milestone[k] === 'string' && saved.milestone[k].trim()
      ) &&
      Array.isArray(saved.requirements) &&
      saved.requirements.every(validRequirement) &&
      new Set(saved.requirements.map((r) => r.id)).size === saved.requirements.length
    ) {
      return saved
    }
  } catch {
    /* The save path reports denied storage. */
  }
  return structuredClone(initial)
}
export function moveDelivery(draft, id, kind, target) {
  const old = draft.requirements.find((r) => r.id === id)
  if (!old || !old.included || !['pre', 'release'].includes(kind) || !versionById[target]) {
    return { error: '这项安排无法移动。' }
  }
  const next = { ...old, [kind]: target }
  if (versionIndex(next.pre) > versionIndex(next.release)) {
    return {
      error:
        kind === 'pre'
          ? 'Pre版本不能晚于Release版本，请先调整Release版本。'
          : 'Release版本不能早于Pre版本，请先调整Pre版本。'
    }
  }
  if (
    kind === 'release' &&
    (next.due < versionById[target].start || next.due > versionById[target].end)
  ) {
    next.due = versionById[target].target
  }
  return {
    draft: { ...draft, requirements: draft.requirements.map((r) => (r.id === id ? next : r)) }
  }
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
export function deadlineWarning(item) {
  const d = calendarDays().find((day) => day.date === item.due)
  return !d ? '日历未覆盖' : d.work ? '' : '截止在休息日'
}
