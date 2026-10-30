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
    version: boundVersion,
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
    // 周期任务没有关联 Issue 与类别，identity 渲染为空、整行不出现。模板保留
    // {{identity}} 槽位：未来宿主带真实任务身份时拼「关联 Issue：…」/「类别：…」
    // 行；未解析的占位符不得冒充真实身份。
    identity: '',
    references,
    skill: workflowStubs[topic],
    // 分点小节而非连排规则墙：「未明确版本前不写材料」是防误写第一闸，放最前；
    // 内部 ID 只作命令参数的约束随执行上下文声明（SKILL-MD-SPEC 用户面表达）。
    version_context:
      topic === 'metrics-refresh'
        ? `## 执行上下文\n这是独立指标配置任务，使用原生项目与工作区上下文。\n${JSON.stringify(context, null, 2)}\n${metricsContext}`
        : [
            ...(boundVersion
              ? ['## 版本（由绑定决定，先于任何材料写入完成读回）']
              : ['## 版本选定（先于任何材料写入完成）']),
            ...(boundVersion
              ? [
                  `- 本工作树已绑定版本 ${boundVersion}（宿主登记为单一正本）：只读写该版材料，不切换到其他版本、不新建版本目录。`,
                  '- 材料按该版直接读回，不按会话标题或日期推断；历史会话恢复后先核对绑定版本未变再继续。',
                  '- 绑定版本即可读写版本——先读回该版材料；验收页面可能已初始化并保存空白草稿，继续使用已有材料，不另建版本目录或平行材料。'
                ]
              : [
                  '- 未明确版本前不写材料。',
                  '- 先读取当前流程选版与候选（ORCA bw materials context）；入口已给出版本时直接读回该版，未明确时与用户确认后用 select 同步右侧选版，不按会话标题或日期推断。',
                  '- 历史会话不绑定版本，恢复后重新核对当前选版。',
                  '- 选版后先读回该版材料；验收页面可能已初始化并保存空白草稿，继续使用已有材料，不另建版本目录或平行材料。'
                ]),
            '',
            '## 材料工具',
            `- 材料契约：ORCA bw materials schema --workflow ${workflow}。`,
            // Why: 绑定树屏内无选版控件，select 子命令对绑定会话是未定义行为面，不暴露。
            ...(boundVersion
              ? [
                  '- 子命令参数以各自 --help 为准：ORCA bw materials context --help、ORCA bw materials list --help、ORCA bw materials read --help、ORCA bw materials save --help。'
                ]
              : [
                  '- 子命令参数以各自 --help 为准：ORCA bw materials context --help、ORCA bw materials select --help、ORCA bw materials list --help、ORCA bw materials read --help、ORCA bw materials save --help。'
                ]),
            '',
            '## 固定工作树纪律',
            // Why: 绑定树登记行读不到真实分支时 branch=null，原句无条件插值会钉出
            // 「null/HEAD」假分支名；读不到就不钉，纪律句如实留白并要求会话内核对。
            ...(branch
              ? [
                  `- 本会话固定在 ${branch} 工作树：材料只经 ORCA bw materials save 绑定该 worktreeId 写入，不直接编辑文件、不另建工作树或分支；归档提交落在 ${branch}，PR/MR 由 ${branch} 开向主分支。`
                ]
              : [
                  '- 本会话的绑定工作树当前读不到真实分支：不钉分支名，绝不冒充旧固定分支名；材料只经 ORCA bw materials save 绑定该 worktreeId 写入，不直接编辑文件、不另建工作树或分支；归档前先在会话中与人核对树的实际分支。'
                ]),
            '',
            '## 执行上下文',
            '内部 ID 仅用作命令参数，不出现在给用户的文本里：',
            JSON.stringify(context, null, 2)
          ].join('\n')
  }
  // identity 为空时整行摘除，不留空行（与上方注释承诺一致）。
  const template = values.identity
    ? systemTemplate
    : systemTemplate.replace(/^[ \t]*\{\{identity\}\}[ \t]*\r?\n/m, '')
  const prompt = template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
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
