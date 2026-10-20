import snapshot from './g3-snapshot.json'
export { snapshot }
export const stages = [
  ['context', '看清起点', '上版结果与本版约束'],
  ['goals', '定目标 · 拆 Issue', '结果、交付、验法与任务'],
  ['review', '落实评审', '要求逐条落到修改'],
  ['archive', 'PR 归档', 'Leader 再审后合入']
]
export const advice = {
  G1: {
    question: '四个项目分别交出什么，Leader 从哪里核对？',
    title: '组内 4 个核心项目的特性与核心指标可在 BW 逐项读回，并有真实数据。',
    deliverable:
      '特性与指标梳理方法及 Skill；benchmark、运维平台、建木、BW 各自归档特性树、核心指标与真实数据。',
    acceptance:
      '逐项目核对 3～4 个特性及各自的引领、滞后指标；在 BW 打开并读回真实数据。忠实采集脚本不要求本版全部完成。',
    source: '#341 与 v0.7 G1；只是表达优化，未新增采集完成承诺。'
  },
  G2: {
    question: '导航结构做完以后，Builder 能连续完成哪段工作？',
    title: 'Builder 能按项目与版本找到计划、任务和验收，并回到对应工作区继续工作。',
    deliverable: '版本运作树高保真及实现；版本、目标、Issue 与原生工作区的归属约定。',
    acceptance:
      '从项目进入 v0.7 的计划、任务、验收；在目标下打开对应 Issue 工作区；切换版本后仍能回到原会话。归档与读回按 G2 确认的边界验证。',
    source: '#383、#328 与 G2 设计；工作区契约由 G2 决定。'
  },
  G3: {
    question: '“进展可读、旅程可见”具体让 Builder 做成什么？',
    title: '计划屏帮助 Builder 定清版本承诺、拆解 Issue 并落实评审；验收屏改善交付核对体验。',
    deliverable: '计划屏高保真与对应实现；验收屏由其负责人独立设计；两屏相关验收的真壳证据。',
    acceptance:
      '1. 进展按目标阅读，目标标题只出现一次。\n2. 每个目标能核对交付内容、验收方式和关联 Issue，并直接进入原生开工入口。\n3. 每条评审要求都能定位到修改和回应，待决定项不会被当作已落实。\n4. Leader 能在归档 PR 复核本次计划与修改；PR 合入后可从代码仓读回。\n验收屏（保留原约定）：\n各项真壳走通留证（截图四件套）；「拆解先于评审」待拍板，拍板后纳入验收。',
    source: '#384、#385、#374 及本轮用户要求；措辞为待采纳建议。'
  },
  G4: {
    question: '“清理完成”的边界是否能逐项核对？',
    title: '本版约定的 Orca 改造 PR 均有人工处置结果，BW 与 Orca 的边界可从仓库读回。',
    deliverable: 'Orca / BW 边界文档；6 个约定 PR 的处置结果与对应 Issue 核验。',
    acceptance:
      '逐项核对 #358、#324、#322、#325、#308、#336 的合入或说明原因后的关闭结果；#323、#317 随对应交付核验。边界文档归档可读回。',
    source: 'v0.7 G4 原始计划；不替人合并或关闭。'
  }
}
export const initialReview = [
  {
    id: 'R1',
    goal: 'G3',
    text: '版本进展按目标分行；展开目标后标题不要重复。',
    issue: 384,
    target: '验收标准',
    status: 'pending',
    response: '',
    evidence: '',
    revision: null
  },
  {
    id: 'R2',
    goal: 'G3',
    text: '目标下的 Issue 直接开工；工作树归属与 G2 对齐。',
    issue: 385,
    target: '交付边界 / Issue',
    status: 'pending',
    response: '',
    evidence: '',
    revision: null
  },
  {
    id: 'R3',
    goal: 'G3',
    text: '评审要求和纪要遗留要在屏内可见，并能追到落实结果。',
    issue: 374,
    target: '目标 / 验收标准',
    status: 'pending',
    response: '',
    evidence: '',
    revision: null
  }
]
export const prior = [
  [
    'G1',
    '工程能力与交付链',
    '已有部分 CI、评审与出包证据；特性旅程 E2E 和工程能力呈现仍有缺口。',
    '#331、#339'
  ],
  ['G2', '特性与核心指标', '三项目有指标资产；统一梳理与真实数据仍需继续。', '#341 → 本版 G1'],
  ['G3', '跨项目查看', '项目墙已落码；团队可见模型仍有待决边界。', '#342']
]
export function taskRows() {
  return snapshot.plan.tasks.map((ref) => ({
    ...ref,
    ...snapshot.issues.find((item) => item.number === ref.number)
  }))
}
export function reviewState(item, revisions) {
  return item.status === 'addressed' && item.revision !== revisions[item.goal]
    ? 'stale'
    : item.status
}
