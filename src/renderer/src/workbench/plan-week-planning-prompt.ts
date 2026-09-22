import { joinFsPath } from './project-charter'

export const WEEK_PLAN_PROMPT_DELIVERY = 'submit-after-ready' as const

export type WeekPlanInjectInput = {
  workspacePath: string
  mainProjectPath: string
  systemPromptPath: string | null
  skillMdPath: string | null
  planningPyPath: string | null
  issueStatePath: string | null
  weekPlanCommentPath: string | null
  metricsPath: string | null
}

type PathExists = (filePath: string) => Promise<boolean>

/** 新开会话才注入；接回已有会话不重递交。 */
export function buildWeekPlanInjectPrompt(input: WeekPlanInjectInput): string {
  const lines = [
    '你在计划页签协助「更新指标与版本计划」。先读系统提示与技能正文，再按 SOP 执行。不要另开 HTML，不要 start/serve，不要 orca tab create --url；右侧已是同一份 JSON 的三屏。',
    '',
    '## 系统提示',
    systemPointer(input.systemPromptPath),
    '',
    '## 目录',
    `- 规划工作树（当前 cwd）：${input.workspacePath}`,
    `- 主项目：${input.mainProjectPath}`,
    `- 数据正本：${joinFsPath(joinFsPath(joinFsPath(input.workspacePath, '.bw'), 'planning'), '<版本>/data.json')}`,
    '已有材料则恢复，允许保存草稿。没有历史先 init default。不要因已有计划退出。结果证据读主项目新提交，不把规划分支旧 HEAD 当最新实现。',
    '',
    '## 技能',
    skillPointer(input.skillMdPath),
    '',
    '## 规范',
    '文件不在就跳过，不编路径。',
    refPointer('issue-state.md', '状态机、版本标签、谁能改到哪', input.issueStatePath),
    refPointer(
      'week-plan-comment.md',
      '仅首次读取旧计划评论；新目标写 JSON',
      input.weekPlanCommentPath
    ),
    refPointer('metrics.md', '怎么采、不许写 0', input.metricsPath),
    '',
    '## 读写',
    cliBlock(input),
    '人在右侧三屏手填会自动保存同一 JSON。模型用 read / update --if-match，冲突时保留手填、重读后合并，不直接覆盖。',
    '第一屏确认由人点按钮；进入第三屏最终确认前，你先 confirm --stage review_ready。',
    '不要自动合入、不要关闭 Issue、不要替 Leader 审核。',
    '',
    '开场先讲清：三屏各做什么、可手填、保存≠确认、三个确认点在哪；再问使用者自己填还是会话辅助，不默认代劳。'
  ]
  return lines.join('\n')
}

export async function resolveWeekPlanInjectInput(
  args: {
    workspacePath: string
    mainProjectPath: string
  },
  exists: PathExists = (filePath) => window.api.fs.pathExists({ filePath })
): Promise<WeekPlanInjectInput> {
  const roots = uniquePaths([args.workspacePath, args.mainProjectPath])
  const skillMdPath = await firstExisting(
    roots.map((root) => joinSegments(root, 'standard', 'skills', 'week-planning', 'SKILL.md')),
    exists
  )
  const skillDir = skillMdPath ? parentDir(skillMdPath) : null
  const planningPyPath = skillDir
    ? await firstExisting([joinSegments(skillDir, 'scripts', 'planning.py')], exists)
    : null
  const promptRoots = roots.map((root) => joinSegments(root, 'standard', 'system-prompt'))
  const refRoots = promptRoots.map((root) => joinFsPath(root, 'references'))
  return {
    workspacePath: args.workspacePath,
    mainProjectPath: args.mainProjectPath,
    systemPromptPath: await firstExisting(
      promptRoots.map((root) => joinFsPath(root, 'SYSTEM.md.tmpl')),
      exists
    ),
    skillMdPath,
    planningPyPath,
    issueStatePath: await firstExisting(
      refRoots.map((root) => joinFsPath(root, 'issue-state.md')),
      exists
    ),
    weekPlanCommentPath: await firstExisting(
      refRoots.map((root) => joinFsPath(root, 'week-plan-comment.md')),
      exists
    ),
    metricsPath: await firstExisting(
      refRoots.map((root) => joinFsPath(root, 'metrics.md')),
      exists
    )
  }
}

function systemPointer(path: string | null): string {
  if (!path) {
    return '- SYSTEM.md.tmpl：未找到。仍遵守最远待评审、只提 MR、不另开 HTML；不要编造路径。'
  }
  return `- SYSTEM.md.tmpl：身份、按任务加载的 reference、全场纪律。\n  ${path}`
}

function skillPointer(path: string | null): string {
  if (!path) {
    return '- week-planning：未找到 SKILL.md。不要编造 SOP；先告知使用者缺技能，只协助核对该工作树 `.bw/planning` 里已有 JSON。'
  }
  return `- week-planning：用每版一份 JSON 核对上周结果、拟定 SMART 目标、会议评审、拆任务并归档。\n  ${path}`
}

function refPointer(name: string, summary: string, path: string | null): string {
  return path ? `- ${name}：${summary}\n  ${path}` : `- ${name}：未找到，跳过`
}

function cliBlock(input: WeekPlanInjectInput): string {
  if (!input.planningPyPath) {
    return '规划脚本 planning.py 未找到。不要编造路径，不要另起 HTML 服务。'
  }
  const py = quote(input.planningPyPath)
  const ws = quote(input.workspacePath)
  return [
    '用本机 Python 3 跑规划脚本（不要 start/serve，不要打开 URL）：',
    `python3 ${py} --workspace ${ws} --version <版本> read`,
    `python3 ${py} --workspace ${ws} --version <版本> update --file <候选> --if-match <etag>`,
    `python3 ${py} --workspace ${ws} --version <版本> confirm --stage results|review_ready|plan`,
    `python3 ${py} --workspace ${ws} collect-issues --plan-version <核对版本>`,
    `python3 ${py} --workspace ${ws} init`,
    `python3 ${py} --workspace ${ws} --version default set-version --name <确定的版号>`,
    `python3 ${py} --workspace ${ws} --version <版本> fetch-meeting`,
    'Windows 可用 python；内联 python -c 读中文时加 -X utf8。'
  ].join('\n')
}

async function firstExisting(paths: string[], exists: PathExists): Promise<string | null> {
  for (const filePath of paths) {
    if (await exists(filePath)) {
      return filePath
    }
  }
  return null
}

function joinSegments(root: string, ...parts: string[]): string {
  return parts.reduce((current, part) => joinFsPath(current, part), root)
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim().length > 0))]
}

function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx <= 0 ? '' : filePath.slice(0, idx)
}

function quote(value: string): string {
  return `"${value}"`
}
