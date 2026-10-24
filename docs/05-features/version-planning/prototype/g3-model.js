import snapshot from './g3-snapshot.json'
export { snapshot }
export const g2Url =
  'http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html'
export const stages = [
  // 第一步按 #426（v0.7 验收会决议）从「上版回顾」改名「计划准备」，与验收屏
  // 「验收准备」口径一致；区块内容仍是上版两行遗留的回显。
  ['context', '计划准备', '从延期与遗留开始'],
  ['goals', '本版目标', '明确结果与验收标准'],
  ['minutes', '会议纪要', '批注与转写稿生成'],
  ['archive', '归档 PR', 'Leader 在原生 PR 页再审']
]
// 上版回顾回显两类人工记录：延期遗留 Issue（验收屏人工 carry 标记，编号 + 标题，
// 可跳转）与会议遗留事项；完整进展 / 交付材料留在验收屏。
export const leftoverIssues = snapshot.priorAcceptance.leftoverIssues
export const meetingDirectives = snapshot.priorAcceptance.meetingDirectives || []
// 2026-10-22 真机反馈轮：v0.6 验收实际没有 carry 标记（issueMarks 全空），
// 「未标记」不能显示成「上版无延期 Issue」的绿灯断言（四铁律：没数据 = Unknown）。
// 实时参考行独立读回上版快照 Issue 的当前状态（gh / git，异步、可重试），
// 只陈述 open 事实，不冒充人工确认的延期结论。演示数据为 v0.6 快照真实 4 条。
export const priorLiveOpen = [
  { number: 331, title: '【v0.6|G1】BW 自身 E2E 用户旅程用例缺失' },
  { number: 332, title: '【v0.6|G1】release skill 未落地步骤脚本化 + 版本描述规范 + 验收报告' },
  {
    number: 339,
    title: '【v0.6|G1】工程能力在 BW 落地：使能项目/builders 工程化能力（intent/spec/原型/开发）'
  },
  { number: 341, title: '【v0.6|G2】帮 builders 梳理特性与核心指标：统一一版并录入真实数据' }
]
// 发送弹窗演示数据：对齐 Orca 原生发送菜单（ReviewNotesSendMenuContent）——
// 「发送至」运行中会话列表（状态点 + 名称，不可用行显示原因）+「新建智能体」
// 快捷启动（会话就绪后自动递交指令）。指令预览区是 BW 包装层在原生菜单上加的。
export const sendTargets = [
  { id: 'plan', name: '计划会话 · Claude', state: '运行中', stateKind: 'ok', eligible: true },
  { id: 'codex', name: 'Codex 后台会话', state: '需要授权', stateKind: 'warn', eligible: false }
]
export const quickLaunchAgents = [
  { id: 'claude', name: 'Claude', note: '新建会话并递交指令' },
  { id: 'codex', name: 'Codex', note: '新建会话并递交指令' }
]
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
// 计划助手注入提示词的设计正本（生产落点：PlanningMinutesSection.tsx 与
// annotations/annotation-markdown.ts，各持一份同名常量，不重复散写）。
// 2026-10-22 第八轮定四处语义：落点是计划材料 minutes 节不是聊天正文；会中发送批注是
// 「累积输入」不是「现在整理」（原文以「整理」结尾会被误当整理请求）；全量清单以最新
// 一次为准；转写稿由必有输入改为助手询问一次。
// 第九轮瘦身（2026-10-22 用户反馈）：按钮 prompt 只承载触发意图与关键约束，builder
// 一眼能懂；落点确认、闭环由人、无批注不编造等 SOP 级规则归 week-planning Skill 与
// 系统提示词（随本轮 Skill 专项同步落地），按钮 prompt 不复述。
// #431 规范轮：整理纪要「汇总」改「提炼」——纪要是提炼的结论不是逐条汇总，质量
// 标准归 Skill 侧纪要规范；批注发送句去「全量清单，以最新一次为准」协议词（两份
// SKILL 各有同款兜底），用户口吻文本只留人话（SKILL-MD-SPEC 用户面表达）。批注
// 发送双意图（2026-10-24 负责人明确）：①按批注帮人调整目标；②纪要整理输入之一。
export const minutesRequestPrompt =
  '整理本次评审会的会议纪要：把会话中已发送的板面批注提炼为共识 / 遗留两块。需要语音转写稿就问我要一次会议 ID。'

export function annotationsSendPrompt(count) {
  return `记录当前板面全部批注（${count} 条），作为调整目标的依据和会议纪要的输入；现在不要整理。`
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
// Issue 行显示 Bug/Feature 分类：issue-state 规范要求的标签里含 bug/缺陷 → Bug；
// 没有分类标签一律默认按 Feature 显示（2026-10-21 用户确认）。
// 快照 labels 为 2026-10-21 经 GitHub API 补采的真实标签。
export function taskKind(labels) {
  return (labels || []).some((label) => /^(bug|缺陷)$/i.test(String(label).trim()))
    ? 'Bug'
    : 'Feature'
}
