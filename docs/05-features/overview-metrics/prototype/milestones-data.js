export const storageKey = 'bw-issue-440-prototype-v2'
export const versions = ['B01', 'B02', 'B03', 'B04']
export const weeks = ['02—08', '09—15', '16—22', '23—29']
export const steps = ['月度选择', '先行 MVP', '部分用户试用', '后续 B 版本完善', 'Issue 持续改善']
export const initial = {
  requirements: [
    {
      id: 'DEMO-01',
      title: '让月度选择接上可试用的交付',
      owner: 'Builder A',
      priority: 1,
      selected: true,
      first: 'B01',
      target: 'B02',
      due: '2026-11-13',
      reason: '先让团队看懂本月为什么做、先交什么，再用试用反馈修理。',
      mvp: '选择大需求、安排 B 版本，并能从项目总览进入本版工作。',
      later: '依据试用反馈完善调整体验、日历冲突提示与跨版回看。'
    },
    {
      id: 'DEMO-02',
      title: '让评审批注回到正在推进的需求',
      owner: 'Builder B',
      priority: 2,
      selected: true,
      first: 'B02',
      target: 'B03',
      due: '2026-11-20',
      reason: '减少会议后手工搬运意见，先验证一次真实评审闭环。',
      mvp: '一场内部评审的意见可以整理并回到原会话。',
      later: '根据使用反馈修理定位、遗漏和批注处理体验。'
    },
    {
      id: 'DEMO-03',
      title: '把重复问题整理成可复用做法',
      owner: 'Builder A',
      priority: 3,
      selected: false,
      first: 'B03',
      target: 'B04',
      due: '2026-11-27',
      reason: '本月先积累真实试用问题；材料不足，暂不占用主要精力。',
      mvp: '从一次重复问题中提炼一份做法并试用。',
      later: '用下一次任务检验是否减少重复讨论。'
    }
  ],
  calendar: null,
  decisions: [],
  status: '讨论中'
}
export function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (
      saved &&
      Array.isArray(saved.requirements) &&
      saved.requirements.length === 3 &&
      saved.requirements.every(
        (item, i) =>
          item &&
          item.id === initial.requirements[i].id &&
          ['title', 'owner', 'reason', 'mvp', 'later'].every(
            (key) => typeof item[key] === 'string'
          ) &&
          typeof item.selected === 'boolean' &&
          [1, 2, 3].includes(item.priority) &&
          versions.includes(item.first) &&
          versions.includes(item.target) &&
          /^2026-11-(0[1-9]|[12]\d|30)$/.test(item.due)
      ) &&
      ['讨论中', '已确认 · 演示'].includes(saved.status) &&
      (!saved.calendar ||
        (typeof saved.calendar.source === 'string' &&
          saved.calendar.days &&
          Object.values(saved.calendar.days).every(
            (day) => day && typeof day.work === 'boolean'
          ))) &&
      Array.isArray(saved.decisions) &&
      saved.decisions.every((item) => typeof item === 'string')
    ) {
      return saved
    }
  } catch {
    /* File previews may deny local storage; the UI reports save failures. */
  }
  return structuredClone(initial)
}
export function calendarSample() {
  return Array.from({ length: 30 }, (_, index) => {
    const day = index + 1
    const date = `2026-11-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const work = day === 14 || (day !== 13 && weekday > 0 && weekday < 6)
    return `${date},${work ? '工作' : '休息'},${day === 13 ? '演示休息日' : day === 14 ? '演示调班' : '演示数据'}`
  }).join('\n')
}
export function parseCalendar(text) {
  const days = {}
  for (const [index, line] of text.trim().split(/\r?\n/).entries()) {
    const [date, kind, ...note] = line.split(/[,，]/).map((part) => part.trim())
    if (!/^2026-11-(0[1-9]|[12]\d|30)$/.test(date) || !['工作', '休息'].includes(kind)) {
      throw new Error(`第 ${index + 1} 行需为 2026-11 的有效日期,工作或休息,说明。`)
    }
    if (days[date]) {
      throw new Error(`${date} 重复：先核对来源，不能静默覆盖。`)
    }
    days[date] = { work: kind === '工作', note: note.join('，') }
  }
  return days
}
export function deadlineWarning(item, calendar) {
  const day = calendar?.days?.[item.due]
  if (!day) {
    return '工作日待核对'
  }
  return day.work ? '工作日' : '截止落在休息日'
}
