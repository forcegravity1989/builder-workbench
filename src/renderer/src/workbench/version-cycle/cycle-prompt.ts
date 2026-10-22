import systemTemplate from '../../../../../standard/system-prompt/SYSTEM.md.tmpl?raw'
import planningStub from '../../../../../skills/week-planning/SKILL.md?raw'
import acceptanceStub from '../../../../../skills/version-acceptance/SKILL.md?raw'
import metricsStub from '../../../../../skills/metrics-refresh/SKILL.md?raw'
import { useAppStore } from '@/store'
import { nativeMetricsPort } from '../metrics-port'
import { cycleBranch } from './native-cycle-workspace'
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
  // Plan/acceptance pin their fixed cycle branch; metrics setup owns its own
  // tree (metrics-setup.ts) and stays unpinned to avoid a circular import.
  const branch = topic === 'metrics-refresh' ? null : cycleBranch({ workflow })
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
    version: null,
    branch
  }
  const metricsContext = topic === 'metrics-refresh' ? await metricsCatalogContext(scope) : ''
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
    version_context: `宿主已确认的执行上下文：\n${JSON.stringify(context, null, 2)}\n${topic === 'metrics-refresh' ? `这是独立指标配置任务，使用原生项目与工作区上下文。\n${metricsContext}` : `材料工具：ORCA bw materials schema --workflow ${workflow}；参数查看 ORCA bw materials context --help、ORCA bw materials select --help、ORCA bw materials list --help、ORCA bw materials read --help、ORCA bw materials save --help。\n本会话固定在 ${branch} 工作树：材料只经 ORCA bw materials save 绑定该 worktreeId 写入，不直接编辑文件、不另建工作树或分支；归档提交落在 ${branch}，PR/MR 由 ${branch} 开向主分支。\n先读取当前流程选版与候选；入口已给出版本时直接读回该版，未明确时与用户确认后用 select 同步右侧选版，不按会话标题或日期推断。历史会话不绑定版本，恢复后重新核对当前选版。未明确版本前不写材料。选版后先读回该版材料；验收页面可能已初始化并保存空白草稿，继续使用已有材料，不另建版本目录或平行材料。`}`
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
