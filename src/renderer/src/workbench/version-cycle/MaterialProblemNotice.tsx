import { useState } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'

export function materialProblemRequest(
  versions: VersionMaterialCandidate[],
  workflow: VersionWorkflow
) {
  const files = versions
    .filter((item) => item.state !== 'ready')
    .map(
      (item) =>
        `- .bw/planning/${item.version}/${workflow === 'plan' ? 'data.json' : 'acceptance.json'}：${item.error ?? (item.state === 'migration-required' ? '旧格式，需要迁移' : '格式无法读取')}`
    )
  return `请处理以下${workflow === 'plan' ? '计划' : '验收'}数据文件：\n${files.join('\n')}\n先读取实际文件及 ORCA skills get week-planning --reference data-and-runtime，说明问题、备份与修复/迁移方案，等我确认后执行。按该 reference 与版本材料协议处理；完成后用材料工具重新读取并同步当前选版。`
}

/** A file problem enters a normal native conversation, including an empty workspace. */
export function MaterialProblemNotice({
  versions,
  workflow,
  startRequest
}: {
  versions: VersionMaterialCandidate[]
  workflow: VersionWorkflow
  startRequest?: (text: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problems = versions.filter((item) => item.state !== 'ready')
  if (!problems.length) {
    return null
  }
  return (
    <div className="vc-material-problem" role="alert">
      <span
        title={problems.map((item) => `${item.version}：${item.error ?? item.state}`).join('\n')}
      >
        {problems.map((item) => item.version).join('、')} 的{workflow === 'plan' ? '计划' : '验收'}
        数据文件格式
        {problems.every((item) => item.state === 'migration-required') ? '较旧' : '有问题'}
        ，暂无法读取。
      </span>
      <button
        className="wb-btn wb-btn-ghost wb-btn-sm"
        disabled={busy || !startRequest}
        onClick={() => {
          setBusy(true)
          setError(null)
          void startRequest?.(materialProblemRequest(problems, workflow))
            .catch((reason) => setError(String(reason)))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? '正在新建会话…' : '在会话中处理'}
      </button>
      {error && <span>{error}</span>}
    </div>
  )
}
