import systemTemplate from '../../../../../standard/system-prompt/SYSTEM.md.tmpl?raw'
import planningStub from '../../../../../skills/week-planning/SKILL.md?raw'
import acceptanceStub from '../../../../../skills/version-acceptance/SKILL.md?raw'
import metricsStub from '../../../../../skills/metrics-refresh/SKILL.md?raw'
import { useAppStore } from '@/store'
import { branchName } from '@/lib/git-utils'
import { isVersionFlowWorkflow } from '../../../../shared/workbench/version-workspace-prepare'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { nativeMetricsPort } from '../metrics-port'
import { cycleBranch } from './native-cycle-workspace'
import { nativeWorkspaceScopeKey, nativeWorkspaceScope } from './native-workspace'
import type { CycleScope } from './ports'
import {
  renderWorkbenchPrompt,
  type WorkbenchPromptContext
} from '../../../../shared/workbench/workflow-prompt'

const workflowStubs = {
  'week-planning': planningStub,
  'version-acceptance': acceptanceStub,
  'metrics-refresh': metricsStub
}

export type WorkbenchPromptScope = Omit<CycleScope, 'workflow'> & {
  workflow: 'week-planning' | 'version-acceptance' | 'metrics-refresh'
  worktreeId: string
}

/** The metric-setup session starts from the real current catalog: definitions plus fixable problems, never a blank guess. */
async function metricsCatalogContext(scope: WorkbenchPromptScope): Promise<string> {
  const lines: string[] = ['当前指标目录（读自宿主，如实）：']
  try {
    const catalog = await nativeMetricsPort(scope.runtimeOwnerEnvironmentId).list({
      repoId: scope.repoId,
      worktreeId: scope.worktreeId,
      hostId: scope.hostId
    })
    if (catalog.definitions.length === 0) {
      lines.push('- （尚无已登记定义）')
    }
    for (const def of catalog.definitions) {
      lines.push(
        `- ${def.name}：角色 ${def.role}${def.target ? `，目标 ${def.target}` : ''}${def.unit ? `，单位 ${def.unit}` : ''}`
      )
    }
    if (catalog.problems.length > 0) {
      lines.push('目录问题（配置错误，待修复，不是未配置）：')
      for (const problem of catalog.problems) {
        lines.push(
          `- ${problem.name ? `${problem.name}：` : ''}${problem.message}（${problem.code}）`
        )
      }
    }
  } catch (reason) {
    lines.push(
      `- 指标目录暂不可读：${reason instanceof Error ? reason.message : String(reason)}（保持未知，不当作未配置）`
    )
  }
  return lines.join('\n')
}

/** Bundled raw template is compiled into the product; ordinary projects supply no standard/. */
export async function resolveWorkbenchPromptAssets(scope: WorkbenchPromptScope) {
  const state = useAppStore.getState()
  const worktree = state.allWorktrees().find((item) => {
    if (item.id !== scope.worktreeId) {
      return false
    }
    try {
      return nativeWorkspaceScopeKey(nativeWorkspaceScope(item)) === nativeWorkspaceScopeKey(scope)
    } catch {
      // 同 id 的登记行宿主/路由坏掉解析不出：跳过该行，不让单条坏行抛穿整个解析。
      return false
    }
  })
  if (!worktree) {
    throw new Error('原生工作树不可用，无法准备任务提示')
  }
  const workflow = scope.workflow === 'version-acceptance' ? 'acceptance' : 'plan'
  const topic = scope.workflow
  // G2（P5）：绑定流程树的提示钉住树的真实分支与绑定版本（版本由绑定单一决定）；
  // 旧无绑定固定树沿原语义钉 bw/week-plan|week-acceptance。metrics 自有树不钉。
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  const boundVersion =
    topic !== 'metrics-refresh' && binding !== null && isVersionFlowWorkflow(binding.workflow)
      ? binding.version
      : null
  const branch =
    topic === 'metrics-refresh'
      ? null
      : boundVersion
        ? // 绑定树只钉真实分支；读不到真实分支就不钉，绝不冒充旧固定分支名（防误归档）。
          worktree.branch
          ? branchName(worktree.branch) || null
          : null
        : cycleBranch({ workflow })
  const context: WorkbenchPromptContext = {
    projectId: scope.projectId,
    repoId: scope.repoId,
    hostId: scope.hostId,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
    worktreeId: scope.worktreeId,
    workspacePath: worktree.path,
    workflow: scope.workflow === 'metrics-refresh' ? scope.workflow : workflow,
    version: boundVersion,
    branch
  }
  const metricsContext = topic === 'metrics-refresh' ? await metricsCatalogContext(scope) : ''
  return renderWorkbenchPrompt({
    context,
    systemTemplate,
    skill: workflowStubs[topic],
    metricsContext
  })
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
