import type { VersionWorkspacePrepareResult } from '../../../shared/workbench/version-workspace-prepare'
import { WORKFLOW_TREE_LABELS } from './version-labels'

/**
 * G2 prepare 结果的人话回报（#436 伴飞裁定后两处共用）：新建版本对话框的报告
 * 面板与版本行「初始化工作区」的直接执行 toast 同一口径，不各写一套判词。
 */

export function stepText(
  result: VersionWorkspacePrepareResult,
  workflow: 'plan' | 'acceptance'
): string {
  const step = result.steps.find((item) => item.workflow === workflow)
  if (!step) {
    return `${WORKFLOW_TREE_LABELS[workflow]}：未执行`
  }
  const state =
    step.state === 'created' ? '已创建' : step.state === 'existing' ? '已就绪（复用登记）' : '失败'
  const material =
    step.material === undefined
      ? ''
      : step.material.state === 'initialized'
        ? ' · 空计划已初始化'
        : ' · 计划材料已存在（未覆盖）'
  return `${WORKFLOW_TREE_LABELS[workflow]}：${state}（${step.branch}）${material}`
}

/** 步骤链非原子回报：任一 problem 或失败步骤都算未全就绪（重试=重入补齐）。 */
export function prepareFailed(result: VersionWorkspacePrepareResult | null): boolean {
  return (
    result !== null &&
    (result.problems.length > 0 || result.steps.some((step) => step.state === 'failed'))
  )
}

/** 未全就绪时的紧凑问题清单（toast 用；报告面板走 stepText 全量）。 */
export function prepareProblemSummary(result: VersionWorkspacePrepareResult): string {
  const items = [
    ...result.steps
      .filter((step) => step.state === 'failed')
      .map((step) => `${WORKFLOW_TREE_LABELS[step.workflow]}创建失败`),
    ...result.problems.map((problem) => problem.message)
  ]
  return items.length > 0 ? items.join('；') : '部分步骤未成功'
}
