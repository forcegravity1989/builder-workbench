import { React } from 'react'
import { metrics, original } from './snapshot.js'

const currentTitles = [
  '上线 Orca 重构版，补齐高优先级特性的六环',
  '推进 BW 从 PR 到上线的自动化流程',
  '优化周一屏，推动更多项目使用'
]
const deliveries = [
  'v0.5 验收报告：六环矩阵、验收 E2E 与用户旅程',
  'BW CI/CD 勾勾表现状，至少推进 1 项落地',
  '周一屏反馈处理结果'
]
// 验收面演示预置：口径参照 v0.5 真实验收结果（2026-10-10 周报快照与 showcase 归档记录），
// 供会中收缩卡与指导区演示；正式界面不预置任何人的结论。
// 进展为唯一自然语言输入位（未达原因直接写在进展里）；G3 保留旧 reason 字段值，
// 演示存量材料的兼容读回（卡内以补充行呈现，不隐藏）。
const acceptanceDemo = [
  {
    actualDelivery:
      'F1–F5 六环拆解 Issue（#248–#252）建立并由 umbrella #247 跟踪；验收 E2E 与用户旅程用例随矩阵补齐。',
    decision: '达成',
    reason: '',
    // 材料演示预置：仓内真实存在的 v0.5 G1 showcase 材料；正式界面从材料链接字段读取，
    // 经 Orca 内置浏览器打开，或打开 .bw 目录下的交付件。
    materials: [
      { label: 'v0.5 G1 showcase 材料', url: '../version-acceptance/showcase-v0.5-g1.html' }
    ]
  },
  {
    actualDelivery: 'CI/门禁/verify 入口与 PR 评审召唤制迁移盘点完成；落地项随 #254 推进一项。',
    decision: '待核对',
    reason: '',
    materials: []
  },
  {
    actualDelivery:
      '使用周一屏的被管理项目数白名单采集脚本交付（关联 #255），可按周出读数；未达原因是本验收窗口被管项目实际接入不足，非能力缺口。',
    decision: '未达',
    reason: '采集能力已就绪，但使用周一屏的被管理项目数未达目标 6；本验收窗口项目接入不足。',
    next: '随真实项目接入与归档持续推进；未达项带入下版，不自动承诺。',
    materials: []
  }
]
const initial = original.plan.goals.map((g, i) => ({
  ...g,
  title: currentTitles[i],
  delivery: deliveries[i],
  criteria: '',
  metricId: i === 2 ? metrics.find((x) => x.name === '使用周一屏的被管理项目数').id : '',
  target: i === 2 ? '6' : '',
  actualDelivery: '',
  decision: '待核对',
  reason: '',
  next: '',
  ...acceptanceDemo[i]
}))
const done = (tasks) => tasks.filter((x) => x.state === 'CLOSED').length
const titleForTask = (t) => t.title.replace(/^【[^】]*】/, '').trim()
// Issue 分类分组依赖提单分类标签（bug/feature 立项随实施批）；无标签如实归未分类，不猜测。
const issueClass = (t) =>
  t.labels?.some((l) => /^(bug|缺陷)/i.test(l.name))
    ? 'bug'
    : t.labels?.some((l) => /^(feature|功能)/i.test(l.name))
      ? 'feature'
      : 'unclassified'
const CLASS_LABELS = { bug: 'Bug 类', feature: 'Feature 类', unclassified: '未分类' }
const readableState = (t) =>
  t.state === 'CLOSED'
    ? '已关闭'
    : t.labels?.some((l) => l.name === 'bw:status:inreview')
      ? '待评审'
      : t.labels?.some((l) => l.name === 'bw:status:inprogress')
        ? '进行中'
        : '开放'
// 责任人从 Issue 原生 assignee 读回；快照缺字段时不显示，不手填。
const assigneeOf = (t) => t.assignee ?? t.assignees?.[0]?.login ?? ''
const Field = ({ label, value, onChange, placeholder, rows = 1, ...props }) => (
  <textarea
    aria-label={label}
    value={value ?? ''}
    rows={rows}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    {...props}
  />
)
const lampNames = {
  gray: '未开始 / 未读取',
  yellow: '进行中 / 待核对',
  red: '阻塞 / 未达',
  green: '已有完成依据'
}
function Lamp({ tone = 'gray', label }) {
  return (
    <span
      className={`lamp lamp-${tone}`}
      role="img"
      aria-label={label || lampNames[tone]}
      title={label || lampNames[tone]}
    />
  )
}
function archiveTone(state) {
  return state === 'merged'
    ? 'green'
    : ['failed', 'changes_requested', 'closed_unmerged'].includes(state)
      ? 'red'
      : ['open', 'draft'].includes(state)
        ? 'yellow'
        : 'gray'
}
export {
  currentTitles,
  deliveries,
  initial,
  done,
  titleForTask,
  issueClass,
  CLASS_LABELS,
  readableState,
  assigneeOf,
  Field,
  lampNames,
  Lamp,
  archiveTone
}

export function ModelSessionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 3h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7l-5 3V5a2 2 0 0 1 2-2Z" />
      <path d="M12 8v6M9 11h6" />
    </svg>
  )
}
