// 验收旅程候选(v10)演示模型。计划材料复用 G3 的 v0.7 真实快照,验收侧状态为本稿演示数据¹。
// #471 整改:举证前移到各 Issue/PR 合入时,验收证据报告改为按目标聚合各 Issue
// 验收件;纪要按目标分组(条目前缀,呈现级实现)。
import snapshot from '../../version-planning/prototype/g3-snapshot.json'
export { snapshot }
export const g2Url = '../version-workspace/version-workspace-prototype.html'
// 注入提示词设计正本(对齐计划屏第九轮瘦身):按钮 prompt 只承载触发意图;
// 落点 minutes 节、人工确认、遗留无闭环位等 SOP 规则归 version-acceptance
// Skill 与系统提示词,按钮 prompt 不复述。批注发送句与计划屏同源
// (g3-model.js 的 annotationsSendPrompt),#431 规范轮定为中性抬头「会议反馈
// 批注内容如下：」——不承载屏别意图,收到批注「按对象回应或修订材料 + 纪要整理
// 输入之一」的双意图归 version-acceptance Skill。整理纪要「汇总」改「提炼」。
export const minutesRequestPrompt =
  '整理本次验收会的会议纪要：把会话中已发送的板面批注提炼为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'
// 「聚合」(#471):报告不再会前采集,改为聚合各 Issue / PR 合入时留下的验收证据;
// prompt 同样只承载触发意图,聚合落点与缺口处置(人确认或自行补充)归 Skill。
export const aggregateRequestPrompt =
  '聚合本次验收的证据报告：把各 Issue / PR 合入时留下的验收证据按目标归并成一份报告，缺证的地方如实标缺。'
// 「预订会议」与「同步会议纪要」(#471 评审新增,会议生命周期首片):预订周五
// 验收会并把会议信息写回材料;同步把本页共识/遗留按固定样式写进该会议的纪要。
// prompt 同样只承载触发意图;固定样式与会议工具归 Skill。
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
// 验收证据报告(#471 整改):一份/版本,按目标聚合各 Issue / PR 合入时留下的
// 验收件(目标 → Issue),会话注入「聚合」生成;缺证如实呈现,人确认或自行补充。
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
// 纪要示例(#471 批注5):条目带「G<n> ·」目标前缀,读视图按前缀分组到各目标
// 小标题下;协议仍是共识/遗留两条平铺清单。共识记各目标会上产生的结论性决定,
// 不复述板面已呈现的达成情况(共享纪要规范:达成情况一律不进纪要);遗留与计划屏
// 同样写清落实结果或 Issue 去向；下版回顾不自动承诺跟进工作。
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
