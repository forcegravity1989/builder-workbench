import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'

/**
 * One-shot context for the unified launch: the selected version and the actual
 * unreadable files ride with the saved automation prompt into the same native
 * session. The model reads, explains and waits for confirmation — clicking the
 * launch button is not consent to modify data.
 */
export function materialProblemRequest(
  versions: VersionMaterialCandidate[],
  workflow: VersionWorkflow,
  version: string | null
): string {
  const file = workflow === 'plan' ? 'data.json' : 'acceptance.json'
  const files = versions
    .filter((item) => item.state !== 'ready')
    .map(
      (item) =>
        `- .bw/planning/${item.version}/${file}：${item.error ?? (item.state === 'migration-required' ? '旧格式，需要迁移' : '格式无法读取')}`
    )
  const selected = version ? `右侧当前选中的版本：${version}。` : '右侧当前未选择版本。'
  return `本次处理请求：\n下面这些${workflow === 'plan' ? '计划' : '验收'}文件还打不开：\n${files.join('\n')}\n${selected}\n先说明旅程仍是准备 → 目标 → 评审 → 拆解 → 归档。这些文件只是旧格式：把旧字段收成新计划，对不上的目标问我，等我确认后执行，不留旧文件副本。按 ORCA skills get week-planning --reference data-and-runtime 转换；完成后重新读取并同步当前选版。`
}
