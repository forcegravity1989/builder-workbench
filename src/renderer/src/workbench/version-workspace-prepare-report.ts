import type { VersionWorkspacePrepareResult } from '../../../shared/workbench/version-workspace-prepare'
import { WORKFLOW_TREE_LABELS } from './version-labels'

/** 未全就绪时，新建表单和初始化入口共用同一问题清单。 */
export function prepareProblemSummary(result: VersionWorkspacePrepareResult): string {
  const items = [
    ...result.steps
      .filter((step) => step.state === 'failed')
      .map((step) => `${WORKFLOW_TREE_LABELS[step.workflow]}创建失败`),
    ...result.problems.map((problem) => problem.message)
  ]
  return items.length > 0 ? items.join('；') : '部分步骤未成功'
}
