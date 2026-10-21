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
// 上版回顾只回显两类：延期遗留 Issue（编号 + 标题，可跳转）与会议遗留事项；
// 完整进展 / 交付材料留在验收屏。v0.6 的 meetingDirectives 为空 → 显示未记录。
export const leftoverIssues = snapshot.priorAcceptance.leftoverIssues
export const meetingDirectives = snapshot.priorAcceptance.meetingDirectives || []
// 指标目录演示数据：复用 v0.5 快照的三个脚本指标样例；v0.7 快照 metricTargets
// 全为空，因此每张目标卡都从「添加指标承诺（可选）」开始。current 为 null
// 表示本期尚未采集，目标值标草案，不拿旧读数冒充本期值。
export const metricCatalog = [
  { id: 'metric-1', name: '纳入 workbench 管理的项目数', current: null },
  { id: 'metric-2', name: '使用周一屏的被管理项目数', current: null },
  { id: 'metric-3', name: '每周闭环的 issue 数', current: null }
]
// 纪要固定两块：共识（若干点，可编辑）与遗留（若干点，逐条闭环状态）。
// 闭环 = 版本计划已按该条修改，由人标记；统一格式提高 Leader 归档 PR 审核效率。
export const initialMinutes = {
  confirmed: true,
  sources: '在线批注 2 条 · 会议转写稿（#385 边界讨论）',
  consensus: [
    '计划屏开工入口保留在目标下；目录、已有工作区查找和原生创建归 G2 原生能力。',
    'G3 目标句与关联 Issue 分工按边界结论修订，详见目标 G3。'
  ],
  followups: [
    { text: 'G2 交接契约在 G2 设计轮明确，不阻塞本版计划合入。', closed: false },
    { text: '忠实采集脚本不强求本周开发完毕，已写入 G1 验收标准。', closed: true }
  ]
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
