// 验收侧状态为交互原型演示数据，计划复用既有快照。
import snapshot from '../../version-planning/prototype/g3-snapshot.json'
export { snapshot }
export const g2Url = '../version-workspace/version-workspace-prototype.html'
// 按钮只展示请求意图；生产入口另附宿主实际安装的完整 Skill 路径。
export const minutesRequestPrompt =
  '整理本次验收会的会议纪要：把会话中已发送的板面批注提炼为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'
export const aggregateRequestPrompt = '聚合本次验收的证据报告。'
export const bookMeetingRequestPrompt = '预订本周五的版本验收会议，完成后把会议信息写回材料。'
export const syncMinutesRequestPrompt =
  '把本页会议纪要的共识与遗留按固定样式同步到已预订的验收会议纪要中。'
// 四步旅程轴:只做同页定位,不是门禁;界面无灯,stage 是材料内部进度。
export const stages = [
  ['prepare', '验收准备', '部署 · 会议 · 证据报告'],
  ['showcase', 'Showcase', '逐目标核对交付结果'],
  ['minutes', '会议纪要', '共识与遗留 · 人工确认'],
  ['archive', '归档 PR 及发版本', '原生 PR 再审 · 授权发布']
]
// 时期切换只用于评审；未合入场景未取得可读固定计划，不借用其他场景的目标。
export const scenes = [
  ['planned', '验收尚未开始'],
  ['unmerged', '计划未合入 · 无固定计划'],
  ['started', '验收已开始 · 未出包'],
  ['prep', '会前 · 准备中'],
  ['meeting', '会中 · showcase'],
  ['wrap', '会后 · 收尾与发布']
]
// 纪要框常驻可编辑:未整理时就是这个空卡,人可直接粘贴/添加,不依赖会话唤起。
export const EMPTY_MINUTES = {
  confirmed: false,
  sources: '尚未整理 · 可直接编辑或粘贴会议结论',
  consensus: [],
  followups: []
}
// 出包区块演示数据¹:BW 自身 dogfood,GitHub 变体(bw-package workflow 产候选包)。
export const PIPELINES = ['BW Package Windows']
export const LATEST_PACKAGE = {
  project: 'forcegravity1989/builder-workbench',
  version: '1.4.198-local.1792540262.f5ac309b226a',
  created: '2026-10-21 14:31:02',
  files: ['orca-windows-setup.exe']
}
export const CANDIDATE = {
  short: 'f5ac309b'
}
// 已登记的报告可打开，待核对项及人的处置保留在报告中。
export const REPORT = {
  file: '.bw/planning/v0.7/acceptance-evidence.html',
  generatedAt: '2026-10-21 16:05'
}
// 各时期的人判/备注/遗留演示预置¹(生产由人在界面点,模型不代勾)。
export const sceneVerdicts = {
  planned: {},
  unmerged: {},
  started: {},
  prep: {},
  meeting: { G1: '达成' },
  wrap: { G1: '达成', G2: '达成', G3: '不达成' }
}
export const sceneIssueNotes = {
  planned: {},
  unmerged: {},
  started: {},
  prep: {},
  meeting: {},
  wrap: {
    341: '第 4 个项目数据下周一才能读回,带入下版跟踪。',
    384: '转写链路调研已闭环,结论并入 #374 跟进。'
  }
}
export const sceneCarry = {
  planned: {},
  unmerged: {},
  started: {},
  prep: {},
  meeting: {},
  wrap: { 341: true }
}
// 未开始/未出包:尚无候选包,出包区块为空态。
export const sceneLatest = {
  planned: null,
  unmerged: null,
  started: null,
  prep: LATEST_PACKAGE,
  meeting: LATEST_PACKAGE,
  wrap: LATEST_PACKAGE
}
// 预订会议演示数据¹:会话预订、信息写回材料;生产由模型用 welink-cli 创建会议
// (逻辑内置于验收技能)执行。纪要区的「同步会议纪要」依赖已预订。
export const MEETING = {
  title: 'v0.7 版本验收会',
  time: '10-23(周五) 14:00',
  id: '92338821'
}
export const sceneMeeting = {
  planned: null,
  unmerged: null,
  started: null,
  prep: MEETING,
  meeting: MEETING,
  wrap: MEETING
}
export const nextSteps = {
  G3: '进展可读与旅程可见两项演示通过;任务顺手一项随转写链路(#374)带入下版,不自动承诺。'
}
const initialMinutes = {
  confirmed: false,
  sources: '会议转写稿(周五验收会)· 人工编辑 3 处',
  consensus: [
    'G1 · 4 个核心项目特性与指标梳理结果自本版起作为组内基线，新增项目按同口径补录。',
    'G2 · 项目墙与侧边栏层次下周起按新结构使用，会话归档验证通过。',
    'G3 · 不阻断发布；原因与安排以目标卡「下一步」为准。'
  ],
  followups: [
    { text: 'G1 · 第 4 个项目特性与指标读回由 #341 继续跟进，是否纳入下版由下次计划确认。' },
    { text: 'G3 · 已落实：转写链路调研已闭环，结论并入 #374 跟进（#384 已关闭）。' }
  ]
}
export const sceneMinutes = {
  planned: null,
  unmerged: EMPTY_MINUTES,
  started: EMPTY_MINUTES,
  prep: EMPTY_MINUTES,
  meeting: EMPTY_MINUTES,
  wrap: initialMinutes
}
export const sceneArchive = {
  planned: null,
  unmerged: null,
  started: null,
  prep: null,
  meeting: null,
  wrap: {
    number: 399,
    state: 'OPEN',
    title: '归档 v0.7 版本验收',
    url: 'https://github.com/forcegravity1989/builder-workbench/pull/399'
  }
}
// 发布读回演示数据¹(#462 修订:板面呈现发布状态)。生产口径与归档 PR 同构:
// 材料只存发布引用(tag,由助手在会话中经人授权执行后写回,同 workflow.archivePr
// 的「引用落材料、读数现算」),是否已发布、Release 地址、资产、时间每次经
// provider 现算读回(参照 workbench.archive.prStatus 薄读回),读数不落材料、
// 不造第二正本;读不回=状态未知,不猜。
export const releaseInfo = {
  tag: 'v0.7.0',
  at: '10-21 18:20',
  url: 'https://github.com/forcegravity1989/builder-workbench/releases/tag/v0.7.0',
  assets: ['orca-windows-setup.exe', 'orca-windows-setup.exe.blockmap', 'latest.yml']
}
// 发布读回演示切换¹:仅供评审逐态查看;生产由真实读回推导,不预置。
// 跟随时期 = wrap(会后)已发布、其余时期未发布。
export const RELEASE_DEMO_STATES = [
  ['follow', '跟随时期'],
  ['published', '已发布'],
  ['absent', '未发布'],
  ['missing', '引用在 · Release 查无'],
  ['unknown', '状态未知'],
  ['reading', '读取中']
]
// 演示覆盖¹:#384 已关闭,演示「已关闭 Issue 不计遗留、已存备注只读展示」。
const issueOverrides = {
  384: { state: 'CLOSED' }
}
export function taskRows() {
  return snapshot.plan.tasks.map((ref) => {
    const issue = snapshot.issues.find((item) => item.number === ref.number)
    return { ...ref, ...issue, ...issueOverrides[ref.number], readable: Boolean(issue) }
  })
}

// Stable grouping keeps the plan's order within each native state category.
export function sortIssueRows(tasks) {
  const rank = (task) => (task.state === 'OPEN' ? 0 : task.state === 'CLOSED' ? 2 : 1)
  return [...tasks].sort((left, right) => rank(left) - rank(right))
}
