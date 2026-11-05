import { useAppStore } from '@/store'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import type { WorkbenchSkillTopic } from '../../../../shared/workbench/skill-assets'
import { installWorkbenchSkill } from '../workbench-skill-install'
import { nativeWorkspaceScopeKey, nativeWorkspaceScope } from './native-workspace'
import type { CycleScope } from './ports'

export type WorkbenchPromptScope = Omit<CycleScope, 'workflow'> & {
  workflow: WorkbenchSkillTopic
  worktreeId: string
  version?: string | null
}

export async function resolveWorkbenchPromptAssets(scope: WorkbenchPromptScope) {
  const worktree = useAppStore
    .getState()
    .allWorktrees()
    .find((item) => {
      if (item.id !== scope.worktreeId) {
        return false
      }
      try {
        return (
          nativeWorkspaceScopeKey(nativeWorkspaceScope(item)) === nativeWorkspaceScopeKey(scope)
        )
      } catch {
        return false
      }
    })
  if (!worktree) {
    throw new Error('原生工作树不可用，无法准备流程 Skill')
  }
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  if (binding && scope.version && binding.version !== scope.version) {
    throw new Error('当前版本与流程工作树绑定不一致，请重新打开对应版本')
  }
  const version = binding?.version ?? scope.version
  const target = version ? ` ${version} 的版本` : '本版'
  const task =
    scope.workflow === 'metrics-refresh'
      ? '和我配置项目指标'
      : scope.workflow === 'week-planning'
        ? `和我制定${target}计划`
        : `和我开展${target}验收`
  const skillPath = await installWorkbenchSkill(scope, scope.worktreeId, scope.workflow)
  return { prompt: `完整读取并使用「${skillPath}」中的 Skill，${task}。` }
}

export async function buildCyclePrompt(
  scope: CycleScope,
  worktreeId: string,
  version?: string | null
) {
  return (
    await resolveWorkbenchPromptAssets({
      ...scope,
      worktreeId,
      version,
      workflow: scope.workflow === 'plan' ? 'week-planning' : 'version-acceptance'
    })
  ).prompt
}
