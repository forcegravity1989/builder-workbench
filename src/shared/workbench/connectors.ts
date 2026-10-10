// Connector（执行工具接入外部服务的 MCP 服务）的目录、命令拼装与状态解析。
// 正本是两家 CLI 自己的配置；这里不存清单，只把人的选择翻译成 CLI 命令、
// 再把 CLI 输出翻译回状态。规格见 docs/05-features/connectors/spec.md。

export type ConnectorAgent = 'claude' | 'codex'

/** user = 所有项目；local = 仅当前项目（本机私有，Claude Code 才有）。 */
export type ConnectorScope = 'user' | 'local'

export type ConnectorTransport = 'http' | 'sse' | 'stdio'

export type ConnectorState =
  | 'connected'
  | 'needs-auth'
  | 'failed'
  | 'pending-approval'
  | 'logged-in'
  | 'no-auth'
  | 'disabled'
  | 'unknown'

export type ConnectorTarget =
  | { transport: 'http' | 'sse'; url: string }
  | { transport: 'stdio'; command: string; args: string[] }

export type ConnectorCatalogEntry = {
  name: string
  title: string
  url: string
  oauth: boolean
}

/** 2026-10-10 实测在线、Claude Code 认作可 OAuth 或免登录的官方地址；增删由人定。 */
export const CONNECTOR_CATALOG: readonly ConnectorCatalogEntry[] = [
  { name: 'linear', title: 'Linear', url: 'https://mcp.linear.app/mcp', oauth: true },
  { name: 'notion', title: 'Notion', url: 'https://mcp.notion.com/mcp', oauth: true },
  {
    name: 'atlassian',
    title: 'Jira · Confluence',
    url: 'https://mcp.atlassian.com/v1/mcp',
    oauth: true
  },
  { name: 'sentry', title: 'Sentry', url: 'https://mcp.sentry.dev/mcp', oauth: true },
  { name: 'figma', title: 'Figma', url: 'https://mcp.figma.com/mcp', oauth: true },
  { name: 'vercel', title: 'Vercel', url: 'https://mcp.vercel.com', oauth: true },
  { name: 'supabase', title: 'Supabase', url: 'https://mcp.supabase.com/mcp', oauth: true },
  { name: 'context7', title: 'Context7', url: 'https://mcp.context7.com/mcp', oauth: false }
]

// 首字符不许是 `-`：否则两家 CLI 会把名称当成选项。
const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/

export function isValidConnectorName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

export function isValidConnectorUrl(url: string): boolean {
  if (!/^https?:\/\/\S+$/.test(url)) {
    return false
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** 本机命令一行拆成命令与参数：空白分隔，单双引号包住的部分不拆。未闭合引号返回 null。 */
export function splitCommandLine(line: string): string[] | null {
  const out: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) {
        out.push(current)
        current = ''
        started = false
      }
    } else {
      current += ch
      started = true
    }
  }
  if (quote) {
    return null
  }
  if (started) {
    out.push(current)
  }
  return out
}

export type ConnectorShell = 'posix' | 'powershell'

// PowerShell 里 `,` 是数组、`@` 开头是展开、`-` 开头可能被脚本吞掉（npm 的 .ps1
// 垫片会消费裸 `--`，`--%` 会停止解析）；POSIX 里开头的 `=` 会被 zsh 展开成路径。
const SAFE_ARG: Record<ConnectorShell, RegExp> = {
  posix: /^[A-Za-z0-9_\-./:@%+,][A-Za-z0-9_\-./:=@%+,]*$/,
  powershell: /^[A-Za-z0-9_./:%+][A-Za-z0-9_\-./:=%+]*$/
}

export function quoteShellArg(arg: string, shell: ConnectorShell): string {
  if (SAFE_ARG[shell].test(arg)) {
    return arg
  }
  // 单引号内两边都不展开变量。PowerShell 把弯单引号也当单引号，一并成对转义。
  return shell === 'powershell'
    ? `'${arg.replace(/['\u2018-\u201B]/g, (q) => q + q)}'`
    : `'${arg.replace(/'/g, `'\\''`)}'`
}

function joinArgs(args: string[], shell: ConnectorShell): string {
  return args.map((a) => quoteShellArg(a, shell)).join(' ')
}

export type ConnectorInstallPlan = {
  name: string
  target: ConnectorTarget
  oauth: boolean
  agents: ConnectorAgent[]
  /** 只影响 Claude Code；Codex 恒为全局。 */
  scope: ConnectorScope
}

/** `codexHome` 只对 Codex 命令生效：显式写进 Orca 同步来源的目录，见 {@link withCodexHome}。 */
export type ConnectorCommand = { agent: ConnectorAgent; argv: string[]; codexHome?: string }

/**
 * Orca 的终端把 CODEX_HOME 指向它托管的运行目录，并在每次起 Codex 会话前用系统目录覆盖它；
 * 在那里改的 connector 会被冲掉。所以 Codex 命令一律显式指向系统目录（同步来源）。
 */
export function withCodexHome(
  commands: ConnectorCommand[],
  codexHome: string | null
): ConnectorCommand[] {
  return codexHome ? commands.map((c) => (c.agent === 'codex' ? { ...c, codexHome } : c)) : commands
}

export function validateInstallPlan(plan: ConnectorInstallPlan): string | null {
  if (!isValidConnectorName(plan.name)) {
    return '名称只能用字母、数字、下划线和短横线，最长 64 个字符。'
  }
  if (plan.agents.length === 0) {
    return '至少选一个执行工具。'
  }
  if (plan.target.transport === 'stdio') {
    if (!plan.target.command.trim()) {
      return '本机命令不能为空。'
    }
  } else if (!isValidConnectorUrl(plan.target.url)) {
    return '地址必须以 http:// 或 https:// 开头。'
  }
  if (plan.target.transport === 'sse' && plan.agents.includes('codex')) {
    return 'Codex 只支持可流式 HTTP 地址，不支持 SSE。'
  }
  return null
}

function addArgv(plan: ConnectorInstallPlan, agent: ConnectorAgent): string[] {
  const t = plan.target
  if (agent === 'claude') {
    const base = ['claude', 'mcp', 'add']
    if (t.transport === 'stdio') {
      return [...base, '-s', plan.scope, plan.name, '--', t.command, ...t.args]
    }
    return [...base, '--transport', t.transport, '-s', plan.scope, plan.name, t.url]
  }
  if (t.transport === 'stdio') {
    return ['codex', 'mcp', 'add', plan.name, '--', t.command, ...t.args]
  }
  return ['codex', 'mcp', 'add', plan.name, '--url', t.url]
}

/** 安装命令序列。Codex 的 add 检测到 OAuth 会自己进登录，不再追加 login。 */
export function buildInstallCommands(plan: ConnectorInstallPlan): ConnectorCommand[] {
  const out: ConnectorCommand[] = []
  for (const agent of plan.agents) {
    out.push({ agent, argv: addArgv(plan, agent) })
    if (agent === 'claude' && plan.oauth && plan.target.transport !== 'stdio') {
      out.push({ agent, argv: ['claude', 'mcp', 'login', plan.name] })
    }
  }
  return out
}

export function buildLoginCommand(agent: ConnectorAgent, name: string): ConnectorCommand {
  return { agent, argv: [agent, 'mcp', 'login', name] }
}

/** 不带范围：名称只在一级时 Claude Code 从那一级移除；同名在多级时它会拒绝，终端里如实报错。 */
export function buildRemoveCommand(agent: ConnectorAgent, name: string): ConnectorCommand {
  return { agent, argv: [agent, 'mcp', 'remove', name] }
}

/**
 * 一条可见终端里执行的整行；前一条失败就停，避免装了一半还去登录。
 * `cwd` 给 Claude「仅当前项目」用：local 范围按执行目录记在项目节下。
 */
export function renderCommandLine(
  commands: ConnectorCommand[],
  shell: ConnectorShell,
  cwd?: string
): string {
  const lines = commands.map((c) => {
    const line = joinArgs(c.argv, shell)
    if (!c.codexHome) {
      return line
    }
    // PowerShell 赋值是表达式模式，裸路径会被当成运算，值必须加引号。
    return shell === 'powershell'
      ? `$env:CODEX_HOME = '${c.codexHome.replace(/['\u2018-\u201B]/g, (q) => q + q)}'; ${line}`
      : `CODEX_HOME=${quoteShellArg(c.codexHome, shell)} ${line}`
  })
  if (shell === 'powershell') {
    const chain = lines
      .map((l, i) => (i === 0 ? l : `if ($LASTEXITCODE -eq 0) { ${l} }`))
      .join('; ')
    return cwd
      ? `Set-Location -LiteralPath ${quoteShellArg(cwd, shell)}; if ($?) { ${chain} }`
      : chain
  }
  const chain = lines.join(' && ')
  return cwd ? `cd ${quoteShellArg(cwd, shell)} && ${chain}` : chain
}
