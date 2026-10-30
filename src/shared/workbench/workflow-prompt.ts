export type WorkbenchPromptTopic = 'week-planning' | 'version-acceptance' | 'metrics-refresh'
export type WorkbenchPromptContext = {
  projectId: string
  repoId: string
  hostId: string
  runtimeOwnerEnvironmentId?: string
  worktreeId: string
  workspacePath: string
  workflow: 'plan' | 'acceptance' | 'metrics-refresh'
  version: string | null
  branch: string | null
}
/** One renderer for automation prompts and the CLI's live session instructions. */
export function renderWorkbenchPrompt({
  context,
  systemTemplate,
  skill = '',
  metricsContext = ''
}: {
  context: WorkbenchPromptContext
  systemTemplate: string
  skill?: string
  metricsContext?: string
}) {
  const topic: WorkbenchPromptTopic =
    context.workflow === 'plan'
      ? 'week-planning'
      : context.workflow === 'acceptance'
        ? 'version-acceptance'
        : 'metrics-refresh'
  const workflow = context.workflow === 'acceptance' ? 'acceptance' : 'plan'
  const boundVersion = context.version,
    branch = context.branch
  const references = ['version-records', 'metrics']
    .map((name) => `- ${name}：ORCA skills get ${topic} --reference ${name}`)
    .join('\n')
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
    skill,
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
