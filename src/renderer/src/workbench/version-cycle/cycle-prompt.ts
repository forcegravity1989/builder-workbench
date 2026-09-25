import systemTemplate from '../../../../../standard/system-prompt/SYSTEM.md.tmpl?raw'
import planningStub from '../../../../../skills/week-planning/SKILL.md?raw'
import acceptanceStub from '../../../../../skills/version-acceptance/SKILL.md?raw'
import metricsStub from '../../../../../skills/metrics-refresh/SKILL.md?raw'
import { useAppStore } from '@/store'
import { nativeWorkspaceScopeKey, nativeWorkspaceScope } from './native-workspace'
import type { CycleScope } from './ports'

const workflowStubs = {
  'week-planning': planningStub,
  'version-acceptance': acceptanceStub,
  'metrics-refresh': metricsStub
}

export type WorkbenchPromptScope = Omit<CycleScope, 'workflow'> & {
  workflow: 'week-planning' | 'version-acceptance' | 'metrics-refresh'
  worktreeId: string
  cycleId?: string
}

/** Bundled raw template is compiled into the product; ordinary projects supply no standard/. */
export async function resolveWorkbenchPromptAssets(scope: WorkbenchPromptScope) {
  const state = useAppStore.getState()
  const worktree = state
    .allWorktrees()
    .find(
      (item) =>
        item.id === scope.worktreeId &&
        nativeWorkspaceScopeKey(nativeWorkspaceScope(item)) === nativeWorkspaceScopeKey(scope)
    )
  if (!worktree) {
    throw new Error('原生工作树不可用，无法准备任务提示')
  }
  const workflow = scope.workflow === 'version-acceptance' ? 'acceptance' : 'plan'
  const topic = scope.workflow
  const references = ['version-records', 'metrics']
    .map((name) => `- ${name}：ORCA skills get ${topic} --reference ${name}`)
    .join('\n')
  const context = {
    projectId: scope.projectId,
    repoId: scope.repoId,
    hostId: scope.hostId,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
    worktreeId: scope.worktreeId,
    workspacePath: worktree.path,
    workflow: scope.workflow === 'metrics-refresh' ? scope.workflow : workflow,
    cycleId: scope.cycleId,
    version: null
  }
  const values: Record<string, string> = {
    title:
      topic === 'week-planning'
        ? '制定版本计划'
        : topic === 'version-acceptance'
          ? '准备与核对版本验收'
          : '配置项目指标',
    workflow: topic,
    number: '',
    category: '',
    references,
    skill: workflowStubs[topic],
    version_context: `宿主已确认的执行上下文：\n${JSON.stringify(context, null, 2)}\n${topic === 'metrics-refresh' ? '这是独立指标配置任务，使用原生项目与工作区上下文。' : `材料工具：ORCA bw materials schema --workflow ${workflow}；ORCA bw materials list/read/save --help。\n版本尚未明确，先列候选并与人确认，不写默认版本。`}`
  }
  const prompt = systemTemplate.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new Error(`未解析的提示字段：${key}`)
    }
    return values[key]
  })
  return {
    prompt,
    skillCommand: `ORCA skills get ${topic}`,
    referencesCommand: `ORCA skills get ${topic} --references`,
    context
  }
}

export async function buildCyclePrompt(scope: CycleScope, worktreeId: string, cycleId: string) {
  return (
    await resolveWorkbenchPromptAssets({
      ...scope,
      workflow: scope.workflow === 'plan' ? 'week-planning' : 'version-acceptance',
      worktreeId,
      cycleId
    })
  ).prompt
}
