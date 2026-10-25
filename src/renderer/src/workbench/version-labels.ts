import type { VersionWorkflow } from '../../../shared/workbench/version-document'

/**
 * G2 版本工作区用户文案单实现：侧栏、对话框、总览与只读回看共用，改文案只动
 * 这一处（检视第二轮收敛：原先各写一份且 goal/Issue 树措辞已现分叉）。
 * version-acceptance 与计划屏侧的存量标签副本（outcomeLabels、「待决」）不在
 * 本模块合并——属本特性外的存量资产，是否统一归文档治理裁定。
 */

/** 业务入口/屏幕文案（无「树」后缀）。 */
export const WORKFLOW_SCREEN_LABELS: Record<VersionWorkflow, string> = {
  plan: '计划',
  acceptance: '验收'
}

/** 工作区树行文案。 */
export const WORKFLOW_TREE_LABELS: Record<VersionWorkflow, string> = {
  plan: '计划树',
  acceptance: '验收树'
}

/** Issue 执行树文案（开工须经任务屏；补绑定用途下拉另附原因后缀）。 */
export const ISSUE_TREE_LABEL = 'Issue 执行树'

/** 补绑定用途选项的目标树文案（用途语义，与树行的「目标树」区分）。 */
export const GOAL_PURPOSE_LABEL = '目标协作树'

/** 目标展示序号（业务身份只认 goalId，序号仅呈现层，按计划投影顺序派生）。 */
export function goalOrdinal(index: number): string {
  return `G${index + 1}`
}

/** 目标树行标签：能在目录投影中索引到目标时带序号，否则泛称。 */
export function goalTreeLabel(index: number | null): string {
  return index === null ? '目标树' : `目标树 ${goalOrdinal(index)}`
}

/** 人工验收结论标签（总览与只读回看同源；结论由人记录，不由 Issue 状态推断）。 */
export const DECISION_LABELS = { met: '达成', 'not-met': '未达', pending: '待核' } as const

/** 提交 SHA 的短显示。 */
export function shortCommit(commit: string): string {
  return commit.slice(0, 9)
}
