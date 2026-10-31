import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'

export type CycleMaterialProblem = VersionMaterialCandidate & { workflow?: VersionWorkflow }

export function materialProblemFile(item: CycleMaterialProblem, workflow: VersionWorkflow) {
  const file = (item.workflow ?? workflow) === 'plan' ? 'data.json' : 'acceptance.json'
  return `.bw/planning/${item.version}/${file}`
}
