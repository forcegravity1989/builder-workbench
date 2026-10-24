// 验收旅程候选(v10)演示模型。计划材料复用 G3 的 v0.7 真实快照,验收侧状态为本稿演示数据¹。
import snapshot from '../../version-planning/prototype/g3-snapshot.json'
export { snapshot }
export const g2Url = 'https://github.com/forcegravity1989/builder-workbench/pull/389'
// 注入提示词设计正本(对齐计划屏第九轮瘦身):按钮 prompt 只承载触发意图;
// 落点 minutes 节、人工确认、遗留无闭环位等 SOP 规则归 version-acceptance
// Skill 与系统提示词,按钮 prompt 不复述。批注发送句与计划屏同源
// (g3-model.js 的 annotationsSendPrompt)。#431 规范轮:「汇总」改「提炼」,
// 用户口吻句去协议词(全量清单语义两份 SKILL 各有兜底)。
export const minutesRequestPrompt =
  '整理本次验收会的会议纪要：把会话中已发送的板面批注提炼为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'
// 四步旅程轴:只做同页定位,不是门禁;界面无灯,stage 是材料内部进度。
export const stages = [
  ['prepare', '验收准备', '部署服务与证据报告'],
  ['showcase', 'Showcase', '勾勾表逐目标 · 人判'],
  ['minutes', '会议纪要', '共识与遗留 · 人工确认'],
  ['archive', '归档 PR 及发版本', '原生 PR 再审 · 授权发布']
]
// 时期为原型场景切换器(不进生产界面):计划未合入空板 / 验收已开始 / 会前 / 会中 / 会后。
export const scenes = [
  ['planned', '计划未合入 · 空板'],
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
// 验收证据报告:一份/版本、全目标合并;验收点=说明+证据罗列,演示项标操作路径。
export const REPORT = {
  file: '.bw/planning/v0.7/acceptance-evidence.html',
  generatedAt: '2026-10-21 16:05'
}
// 各时期的人判/备注/遗留演示预置¹(生产由人在界面点,模型不代勾)。
export const sceneVerdicts = {
  planned: {},
  started: {},
  prep: {},
  meeting: { G1: '达成' },
  wrap: { G1: '达成', G2: '达成', G3: '不达成' }
}
export const sceneIssueNotes = {
  planned: {},
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
  started: {},
  prep: {},
  meeting: {},
  wrap: { 341: true }
}
// 未开始/未出包:尚无候选包,出包区块为空态。
export const sceneLatest = {
  planned: null,
  started: null,
  prep: LATEST_PACKAGE,
  meeting: LATEST_PACKAGE,
  wrap: LATEST_PACKAGE
}
export const nextSteps = {
  G3: '进展可读与旅程可见两项演示通过;任务顺手一项随转写链路(#374)带入下版,不自动承诺。'
}
// 纪要(与计划屏同款两块结构;验收侧遗留条目无闭环位,原样供下版计划屏「会议遗留」)。
const initialMinutes = {
  confirmed: false,
  sources: '会议转写稿(周五验收会)· 人工编辑 3 处',
  consensus: [
    'G1/G2 演示通过;项目墙与侧边栏层次下周起按新结构使用。',
    'G3 未达不阻断发布;原因与安排以目标卡「下一步」为准。'
  ],
  followups: [
    { text: '第 4 个项目特性与指标读回纳入下周计划 G1 候选。' },
    { text: '验收证据报告格式规范另立,与版本收尾总结报告分工对齐。' }
  ]
}
export const sceneMinutes = {
  planned: null,
  started: EMPTY_MINUTES,
  prep: EMPTY_MINUTES,
  meeting: EMPTY_MINUTES,
  wrap: initialMinutes
}
export const sceneArchive = {
  planned: null,
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
export const releaseInfo = {
  version: 'v0.7.0',
  at: '10-21 18:20',
  commit: 'f5ac309b',
  assets: 'orca-windows-setup.exe · blockmap · latest.yml'
}
// 演示覆盖¹:#384 已关闭,演示「已关闭 Issue 不计遗留、已存备注只读展示」。
const issueOverrides = {
  384: { state: 'CLOSED' }
}
export function taskRows() {
  return snapshot.plan.tasks.map((ref) => ({
    ...ref,
    ...snapshot.issues.find((item) => item.number === ref.number),
    ...issueOverrides[ref.number]
  }))
}
