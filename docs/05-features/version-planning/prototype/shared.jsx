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
  next: ''
}))
const done = (tasks) => tasks.filter((x) => x.state === 'CLOSED').length
const titleForTask = (t) => t.title.replace(/^【[^】]*】/, '').trim()
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
  Field,
  lampNames,
  Lamp,
  archiveTone
}
