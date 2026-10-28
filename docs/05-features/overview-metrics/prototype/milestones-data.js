// Fixtures describe a simulated November, never the real v0.8 commitment.
export const storageKey = 'bw-issue-440-prototype-v3'
export const versions = ['B01', 'B02', 'B03', 'B04']
export const weeks = ['02—08', '09—15', '16—22', '23—29']
export const currentDay = '2026-11-11'
export const versionFacts = {
  B01: {
    label: '本版已验收',
    source: '已有人工验收记录',
    detail: '先行 MVP 已允许小范围试用。',
    plan: true
  },
  B02: {
    label: '执行中',
    source: '已有确认计划；5 个 Issue 中 2 个已关闭',
    detail: '本版仍在执行，尚无正式验收结论。Issue 数是版本任务事实，不是大需求完成率。',
    plan: true
  },
  B03: {
    label: '未开始计划',
    source: '读取成功，未发现版本计划',
    detail: '只有月度安排；尚无本版范围、任务或验收数据。',
    plan: false
  },
  B04: {
    label: '状态未知',
    source: '版本材料读取失败',
    detail: '不能据读取失败判断尚未计划，保留月度安排并重试读取。',
    plan: null
  }
}
export const initial = {
  requirements: [
    {
      id: 'DEMO-01',
      title: '项目总览里程碑规划',
      owner: 'yuzhup',
      priority: 1,
      selected: true,
      first: 'B01',
      target: 'B02',
      due: '2026-11-13',
      reason: '先让团队在总览选定重点，并沿同一需求看到可试用交付与后续完善。',
      mvp: '选择大需求、安排 B 版本，并从项目总览进入本版工作。',
      later: '依据内部试用反馈完善直接编辑、跨月回看和日历提示。'
    },
    {
      id: 'DEMO-02',
      title: '评审意见回到原会话',
      owner: 'kanadead',
      priority: 2,
      selected: true,
      first: 'B02',
      target: 'B03',
      due: '2026-11-20',
      reason: '先验证一次会议批注到模型继续处理的闭环，再修理定位和遗漏。',
      mvp: '一场内部评审的意见可以整理并回到原会话。',
      later: '根据使用反馈修理定位、遗漏和批注处理体验。'
    },
    {
      id: 'DEMO-03',
      title: '重复问题沉淀为可复用做法',
      owner: 'yuzhup',
      priority: 3,
      selected: false,
      first: 'B03',
      target: 'B04',
      due: '2026-11-27',
      reason: '先积累真实试用问题；本月暂不占用主要精力。',
      mvp: '从一次重复问题中提炼一份做法并试用。',
      later: '用下一次任务检验是否减少重复讨论。'
    }
  ],
  decisions: []
}
export function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (
      saved &&
      Array.isArray(saved.requirements) &&
      saved.requirements.length === initial.requirements.length &&
      saved.requirements.every(
        (r, i) =>
          r?.id === initial.requirements[i].id &&
          ['title', 'owner', 'reason', 'mvp', 'later'].every(
            (k) => typeof r[k] === 'string' && r[k].trim()
          ) &&
          typeof r.selected === 'boolean' &&
          [1, 2, 3].includes(r.priority) &&
          versions.includes(r.first) &&
          versions.indexOf(r.first) < versions.indexOf(r.target) &&
          /^2026-11-(0[1-9]|[12]\d|30)$/.test(r.due) &&
          Number(r.due.slice(-2)) >= 2 + versions.indexOf(r.target) * 7 &&
          Number(r.due.slice(-2)) <= 8 + versions.indexOf(r.target) * 7
      ) &&
      Array.isArray(saved.decisions) &&
      saved.decisions.every((x) => typeof x === 'string')
    ) {
      return saved
    }
  } catch {
    /* Storage may be disabled; the save path reports that separately. */
  }
  return structuredClone(initial)
}
export function calendarDays(month = 11) {
  const count = new Date(Date.UTC(2026, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1
    const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    // Illustrative Saturdays, not verified Huawei overtime dates.
    const overtime = day === (month === 10 ? 17 : 14)
    return { date, day, weekday, overtime, work: overtime || (weekday > 0 && weekday < 6) }
  })
}
export function deadlineWarning(item) {
  const day = calendarDays().find((d) => d.date === item.due)
  return !day ? '日历未覆盖' : day.work ? '' : '截止在休息日'
}
