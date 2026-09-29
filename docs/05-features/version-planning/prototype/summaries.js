import { metrics } from './snapshot.js'
import { done } from './shared.jsx'
import {
  acceptanceMetric,
  acceptanceWindow
} from '../../version-acceptance/prototype/metric-evidence.jsx'

function buildMinutes({ goals }) {
  return `## 本周 Top3 目标\n${goals.map((g, i) => `${i + 1}. ${g.title || '待明确'}`).join('\n')}\n\n## 周五交付件\n${goals.map((g) => `- ${g.label}：${g.delivery || '待明确'}${g.criteria ? `；验收标准：${g.criteria}` : ''}`).join('\n')}\n\n## 数字指标变化\n${
    goals
      .filter((g) => g.metricId)
      .map((g) => {
        const m = metrics.find((x) => x.id === g.metricId)
        return `- ${g.label} ${m.name}：当前 ${m.current ?? '未采集'} → 本版目标 ${g.target || '待明确'}${m.current === null ? '（待采集后核对数值承诺）' : ''}`
      })
      .join('\n') || '- 本版未承诺指标'
  }`
}
function buildReport({ goals, hasGap, historical, taskRows }, forVersion) {
  const reportGoals = forVersion === 'v0.5' ? goals : historical,
    reportTasks = taskRows(forVersion),
    reportGoalIssues = (g) => reportTasks.filter((t) => t.goal === g.label)
  return `# ${forVersion} 版本验收\n\n候选提交：待固定\n准备材料：待关联到候选\n\nIssue 完成 ${done(
    reportTasks
  )}/${reportTasks.length}\n${reportGoals
    .map((g) => {
      const m = metrics.find((x) => x.id === g.metricId)
      const selected = acceptanceMetric(g)
      const window = acceptanceWindow(g)
      return `\n## ${g.label} ${g.title}\n- 约定：${
        g.delivery || g.metric || '未填写'
      }\n- 实际交付：${g.actualDelivery || g.note || '未提供'}${
        m
          ? `\n- 计划指标：${m.name}；原目标 ${g.target || '未约定'}；计划基线 ${g.metricBaseline ?? '未取得'}`
          : forVersion === 'v0.4'
            ? `\n- 历史原记录：${g.reading || '未取得'}（非本期脚本实测）`
            : '\n- 本目标未约定指标'
      }${selected ? `\n- 验收指标：${selected.name}；区间 ${window.since} 至 ${window.until}（不含）；${window.granularity === 'week' ? '按周' : '按日'}；实际采集来源与读数：尚未取得` : ''}\n- 验收结论：${g.decision}\n- 依据${hasGap(g) ? ' / 未达项' : ''}：${g.reason || '未填写'}${
        hasGap(g) ? `\n- 下一步：${g.next || '待安排'}` : ''
      }\n- Issue 完成：${done(reportGoalIssues(g))}/${reportGoalIssues(g).length}`
    })
    .join('\n')}`
}
export { buildMinutes, buildReport }
