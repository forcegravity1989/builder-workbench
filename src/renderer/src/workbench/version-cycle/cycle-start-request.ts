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
  return `本次处理请求：\n请处理以下${workflow === 'plan' ? '计划' : '验收'}数据文件：\n${files.join('\n')}\n${selected}\n先读取实际文件及 ORCA skills get week-planning --reference data-and-runtime，说明问题、备份与修复/迁移方案，等我确认后执行。按该 reference 与版本材料协议处理；完成后用材料工具重新读取并同步当前选版。`
}
