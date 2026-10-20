import snapshot from './g3-snapshot.json'
export { snapshot }
export const g2Url =
  'http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html'
export const stages = [
  ['context', '上版回顾'],
  ['goals', '本版目标'],
  ['review', '重要评审'],
  ['archive', '归档 PR']
]
// Editorial excerpts of the fixed acceptance source; never presented as raw fields or live results.
export const prior = [
  {
    id: 'G1',
    title: '工程能力与交付链',
    result: '真实 PR、出包与发布链部分走通；特性旅程 E2E、验收报告仍缺。',
    next: '先完善验收流程，工程化屏可暂缓。',
    outcome: '未达成'
  },
  {
    id: 'G2',
    title: '特性与核心指标',
    result: '3 个项目已有指标资产；#341 的统一梳理与真实数据仍待补齐。',
    next: '#341 延续至本版 G1，补齐第 4 个项目。',
    outcome: '未达成'
  },
  {
    id: 'G3',
    title: '跨项目查看',
    result: '项目墙已交付；团队共享边界仍待决定，暂不宣称可用。',
    next: '#342 留待专项决定；专项补验收旅程。',
    outcome: '已达成'
  }
]
export const initialReview = [
  {
    id: 'R1',
    goal: 'G3',
    title: '计划屏的开工入口与工作区归属，如何分工？',
    requirement: 'G3 保留目标下的开工入口；目录、已有工作区查找和原生创建由 G2 负责。',
    source: '#385 · 边界讨论示例',
    response: '',
    status: '待讨论'
  }
]
export function taskRows() {
  return snapshot.plan.tasks.map((ref) => ({
    ...ref,
    ...snapshot.issues.find((item) => item.number === ref.number)
  }))
}
