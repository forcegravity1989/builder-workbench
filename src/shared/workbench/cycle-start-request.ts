import type { VersionMaterialCandidate } from './version-material-request'
import type { VersionWorkflow } from './version-document'

export type CycleMaterialProblem = VersionMaterialCandidate & { workflow?: VersionWorkflow }

export function materialProblemFile(item: CycleMaterialProblem, workflow: VersionWorkflow) {
  const file = (item.workflow ?? workflow) === 'plan' ? 'data.json' : 'acceptance.json'
  return `.bw/planning/${item.version}/${file}`
}

/** Diagnostic context read from live material candidates; changes still require human confirmation. */
export function materialProblemRequest(
  versions: CycleMaterialProblem[],
  workflow: VersionWorkflow,
  version: string | null
): string {
  const files = versions
    .filter((item) => item.state !== 'ready')
    .map(
      (item) =>
        `- ${materialProblemFile(item, workflow)}：${item.error ?? (item.state === 'migration-required' ? '旧格式，需要迁移' : '格式无法读取')}`
    )
  const selected = version ? `右侧当前选中的版本：${version}。` : '右侧当前未选择版本。'
  return `本次处理请求：\n下面这些版本材料文件还打不开：\n${files.join('\n')}\n${selected}\n先说明本次工作流与实际文件问题；旧格式按迁移约定转换，损坏文件先诊断，不把损坏当成旧格式。对不上的目标问我，等我确认后执行，不留旧文件副本。完成后重新读取并同步当前选版。`
}
