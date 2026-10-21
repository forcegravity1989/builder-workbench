import snapshot from './g3-snapshot.json'
export { snapshot }
export const g2Url =
  'http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html'
export const stages = [
  ['context', '上版回顾', '从延期与遗留开始'],
  ['goals', '本版目标', '明确结果与验收标准'],
  ['minutes', '会议纪要', '批注与转写稿生成'],
  ['archive', '归档 PR', 'Leader 在原生 PR 页再审']
]
// Short labels aid navigation; progress and deliveries remain source fields.
const priorTitles = { G1: '工程能力与交付链', G2: '特性与核心指标', G3: '跨项目查看' }
export const prior = snapshot.priorAcceptance.results.map((result) => ({
  ...result,
  title: priorTitles[result.goalId],
  conclusion: { met: '已达成', 'not-met': '未达成' }[result.outcome] || '未确认'
}))
// 延期 = 上版规划未干完、带入本版的目标与 Issue；遗留 = 上版会议遗留的事项。
export const postponed = prior.filter((item) => item.conclusion !== '已达成')
// 纪要固定三节：统一格式，提高 Leader 归档 PR 审核效率。
export const minutesSections = [
  ['conclusions', '结论与取舍'],
  ['adjustments', '目标与计划调整'],
  ['followups', '遗留与跟进']
]
export const initialMinutes = {
  confirmed: true,
  sources: '在线批注 2 条 · 会议转写稿（#385 边界讨论）',
  sections: {
    conclusions: '计划屏开工入口保留在目标下；目录、已有工作区查找和原生创建归 G2 原生能力。',
    adjustments: 'G3 目标句与关联 Issue 分工按边界结论修订，详见目标 G3。',
    followups: 'G2 交接契约在 G2 设计轮明确，不阻塞本版计划合入。'
  }
}
// 时期为原型场景切换器（不进生产界面）：验证计划未建、未拆解时旅程是否流畅。
export const scenes = [
  ['none', '计划未建'],
  ['goals', '目标已定 · 未拆 Issue'],
  ['full', '已拆解 · 纪要与归档']
]
export function taskRows(scene) {
  if (scene !== 'full') {
    return []
  }
  return snapshot.plan.tasks.map((ref) => ({
    ...ref,
    ...snapshot.issues.find((item) => item.number === ref.number)
  }))
}
