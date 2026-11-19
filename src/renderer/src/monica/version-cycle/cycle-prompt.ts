import { useAppStore } from '@/store'
import { normalizeStoredMonicaVersionBinding } from '../../../../shared/monica/version-binding'
import type { MonicaSkillTopic } from '../../../../shared/monica/skill-assets'
import { installMonicaSkill } from '../monica-skill-install'
import { nativeWorkspaceScopeKey, nativeWorkspaceScope } from './native-workspace'
import type { CycleScope } from './ports'

export type MonicaPromptScope = Omit<CycleScope, 'workflow'> & {
  workflow: MonicaSkillTopic
  worktreeId: string
  version?: string | null
}

export async function resolveMonicaPromptAssets(scope: MonicaPromptScope, request?: string) {
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
  const binding = normalizeStoredMonicaVersionBinding(worktree.workbenchVersionBinding)
  if (scope.workflow !== 'metrics-refresh') {
    const workflow = scope.workflow === 'week-planning' ? 'plan' : 'acceptance'
    if (
      !binding ||
      binding.workflow !== workflow ||
      (scope.version && binding.version !== scope.version)
    ) {
      throw new Error('请从版本侧栏打开对应版本的流程工作区。')
    }
  }
  const target = binding ? ` ${binding.version} 的版本` : ''
  const task =
    scope.workflow === 'metrics-refresh'
      ? '和我配置项目指标'
      : scope.workflow === 'week-planning'
        ? `和我制定${target}计划`
        : `和我开展${target}验收`
  const skillPath = await installMonicaSkill(scope, scope.worktreeId, scope.workflow)
  return { prompt: `完整读取并使用「${skillPath}」中的 Skill，${request ?? task}。` }
}

export async function buildCyclePrompt(
  scope: CycleScope,
  worktreeId: string,
  version?: string | null
) {
  return (
    await resolveMonicaPromptAssets({
      ...scope,
      worktreeId,
      version,
      workflow: scope.workflow === 'plan' ? 'week-planning' : 'version-acceptance'
    })
  ).prompt
}
