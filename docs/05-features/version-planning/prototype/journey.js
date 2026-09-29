import { metrics } from './snapshot.js'
import { archiveTone } from './shared.jsx'
import {
  ClipboardList,
  Target,
  Presentation,
  BrainCircuit,
  GitPullRequest,
  PackageCheck
} from 'lucide-react'
export function journeySteps({
  goals,
  current,
  hasGap,
  version,
  view,
  progress,
  tasks,
  goalIssues
}) {
  const goalTone = goals.some(
    (g) => g.metricId && metrics.find((m) => m.id === g.metricId)?.current === null
  )
    ? 'yellow'
    : goals.every((g) => g.title.trim() && (g.delivery.trim() || g.criteria.trim() || g.metricId))
      ? 'green'
      : goals.some((g) => g.title.trim())
        ? 'yellow'
        : 'gray'
  const acceptanceTone = current.some(hasGap)
    ? 'red'
    : current.every((g) => g.decision === '达成')
      ? 'green'
      : current.some((g) => g.decision !== '待核对')
        ? 'yellow'
        : 'gray'
  const evidencePresent = (g) => !!(g.actualDelivery?.trim() || (version === 'v0.4' && g.note))
  const deliveryTone = current.every(evidencePresent)
    ? 'green'
    : current.some(evidencePresent)
      ? 'yellow'
      : 'gray'
  const archiveState = 'unknown'
  const steps =
    view === 'monday'
      ? [
          [
            ClipboardList,
            '准备',
            progress ? 'green' : 'gray',
            progress ? '已提供版本进展' : '待填写版本进展'
          ],
          [Target, '目标', goalTone, goalTone === 'yellow' ? '指标待采集核对' : '目标内容已填写'],
          [Presentation, '评审', 'gray', '与 PL 讨论并直接修改目标；评审结论未读取'],
          [
            BrainCircuit,
            '拆解',
            tasks.length && goals.every((g) => goalIssues(g).length) ? 'green' : 'gray',
            '已关联版本 Issue'
          ],
          [GitPullRequest, '归档', archiveTone(archiveState), '归档 PR 状态未读取']
        ]
      : [
          [PackageCheck, '准备交付', deliveryTone, '在会话中准备交付，在目标卡核对材料'],
          [
            Presentation,
            '展示验收',
            acceptanceTone,
            acceptanceTone === 'red'
              ? '存在未达目标'
              : acceptanceTone === 'green'
                ? '已填写人的验收结论'
                : '待填写验收结论'
          ],
          [GitPullRequest, '归档', archiveTone(archiveState), '归档 PR 状态未读取']
        ]
  return steps
}
