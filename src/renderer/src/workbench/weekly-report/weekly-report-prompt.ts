import { weeklyReportTemplate } from '../../../../shared/workbench/weekly-report'
import systemTemplate from '../../../../../standard/system-prompt/SYSTEM.md.tmpl?raw'
import weeklyReportStub from '../../../../../skills/weekly-report/SKILL.md?raw'

export function buildWeeklyReportPrompt(args: {
  projectName: string
  repository: string
  periodStart: string
  periodEndExclusive: string
  timezone: string
  reportPath: string
  executionContext: {
    projectId: string
    repoId: string
    hostId: string
    runtimeOwnerEnvironmentId?: string | null
    worktreeId: string
    workspacePath: string
  }
}): string {
  const output = {
    schemaVersion: 1,
    origin: 'conversation',
    project: { name: args.projectName, repository: args.repository },
    period: {
      start: args.periodStart,
      endExclusive: args.periodEndExclusive,
      timezone: args.timezone
    },
    version: null,
    generatedAt: '实际生成时间 ISO8601（含时区）',
    sections: Object.fromEntries(
      weeklyReportTemplate.map((section) => [section.key, [section.columns]])
    ),
    problemSummary: '有证据的统计或未知',
    sources: [{ url: '真实来源 URL 或仓内路径', summary: '支持的事实及精确统计窗口' }],
    manual: {}
  }
  const values: Record<string, string> = {
    title: '更新项目周报',
    workflow: 'weekly-report',
    number: '',
    category: '',
    references: [
      '周报提炼与保存：ORCA skills get weekly-report --reference report-writing；ORCA skills get weekly-report --reference report-storage。',
      '项目材料与指标按需读：ORCA skills get weekly-report --reference version-records；ORCA skills get weekly-report --reference metrics。'
    ].join('\n'),
    skill: weeklyReportStub,
    version_context: `宿主已确认的执行上下文：\n${JSON.stringify({ ...args.executionContext, workflow: 'weekly-report', projectName: args.projectName, repository: args.repository, period: output.period, reportPath: args.reportPath }, null, 2)}\n输出结构（示例行是固定列名，须替换为内容；version 未明确保持 null）：\n${JSON.stringify(output, null, 2)}`
  }
  return systemTemplate.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new Error(`未解析的周报提示字段：${key}`)
    }
    return values[key]
  })
}
