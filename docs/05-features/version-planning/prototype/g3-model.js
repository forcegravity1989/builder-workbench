import snapshot from './g3-snapshot.json'
export { snapshot }
export const g2Url =
  'http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html'
export const stages = [
  ['context', '上版回顾', '带着交付与遗留开始'],
  ['goals', '本版目标', '明确结果与交付'],
  ['review', '重要评审', '回应关键取舍'],
  ['archive', '归档 PR', '交由 Leader 再审']
]
// Short labels aid navigation; progress and deliveries remain source fields.
const priorTitles = { G1: '工程能力与交付链', G2: '特性与核心指标', G3: '跨项目查看' }
export const prior = snapshot.priorAcceptance.results.map((result) => ({
  ...result,
  title: priorTitles[result.goalId],
  conclusion: { met: '已达成', 'not-met': '未达成' }[result.outcome] || '未确认'
}))
export const initialReview = [
  {
    id: 'R1',
    goal: 'G3',
    title: '计划屏的开工入口与工作区归属，如何分工？',
    requirement: 'G3 保留目标下的开工入口；目录、已有工作区查找和原生创建由 G2 负责。',
    source: '#385 · 边界讨论示例',
    response: ''
  }
]
export function taskRows() {
  return snapshot.plan.tasks.map((ref) => ({
    ...ref,
    ...snapshot.issues.find((item) => item.number === ref.number)
  }))
}
