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
    version_context: `宿主已确认的执行上下文：\n${JSON.stringify(context, null, 2)}\n${topic === 'metrics-refresh' ? '这是独立指标配置任务，使用原生项目与工作区上下文。' : `材料工具：ORCA bw materials schema --workflow ${workflow}；参数查看 ORCA bw materials context --help、ORCA bw materials select --help、ORCA bw materials list --help、ORCA bw materials read --help、ORCA bw materials save --help。\n先读取当前流程选版与候选，向用户确认本次版本；确认后用 select 同步右侧选版，不按会话标题或日期推断。历史会话不绑定版本，恢复后重新核对当前选版。未明确版本前不写材料，选版本身不创建材料。`}`
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

export async function buildCyclePrompt(scope: CycleScope, worktreeId: string) {
  return (
    await resolveWorkbenchPromptAssets({
      ...scope,
      workflow: scope.workflow === 'plan' ? 'week-planning' : 'version-acceptance',
      worktreeId
    })
  ).prompt
}
