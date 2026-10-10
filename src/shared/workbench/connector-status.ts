// 两家 CLI 的列表输出 → 每个 connector 在每个执行工具上的状态。口径见
// docs/05-features/connectors/spec.md §2：只从 CLI 输出推导，认不出就是 unknown。

import { z } from 'zod'
import {
  isValidConnectorName,
  type ConnectorAgent,
  type ConnectorState,
  type ConnectorTarget
} from './connectors'

export type ConnectorProbe = { state: ConnectorState; detail?: string }

/**
 * `claude mcp list` 的行形如 `name: target - ✔ Connected`。名称取第一个 `: ` 之前；
 * 状态从目标后第一个「 - 状态符号」起算——目标与失败原因里都可能出现 ` - `。
 * 名称不合规的行（插件与 claude.ai 账号里的服务，名称带冒号或空格）不列。
 */
const CLAUDE_LINE = /^([^:\s]+): (.*?) - ([✔✘!⏸⊘].*|- .*)$/

export function parseClaudeMcpList(
  stdout: string
): Map<string, ConnectorProbe & { target: string }> {
  const out = new Map<string, ConnectorProbe & { target: string }>()
  for (const raw of stdout.split(/\r?\n/)) {
    const m = CLAUDE_LINE.exec(raw.trim())
    if (!m || !isValidConnectorName(m[1])) {
      continue
    }
    out.set(m[1], { ...claudeStatus(m[3]), target: m[2] })
  }
  return out
}

function claudeStatus(text: string): ConnectorProbe {
  if (/^✔ Connected\b/.test(text)) {
    return { state: 'connected' }
  }
  if (/^! Needs authentication\b/.test(text)) {
    return { state: 'needs-auth' }
  }
  if (text.startsWith('⏸')) {
    return { state: 'pending-approval' }
  }
  if (text.startsWith('⊘')) {
    return { state: 'disabled' }
  }
  if (text.startsWith('✘')) {
    const reason = /^✘ [^—]*—\s*(.+)$/.exec(text)?.[1] ?? text.slice(1).trim()
    return { state: 'failed', detail: reason }
  }
  return { state: 'unknown', detail: text }
}

export type CodexConnectorRow = { name: string; target: ConnectorTarget | null } & ConnectorProbe

export function parseCodexMcpListJson(stdout: string): CodexConnectorRow[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) {
    return null
  }
  const rows: CodexConnectorRow[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const rec = item as Record<string, unknown>
    if (typeof rec.name !== 'string') {
      continue
    }
    if (isCodexPluginServer(rec.transport)) {
      continue
    }
    rows.push({ name: rec.name, target: codexTarget(rec.transport), ...codexState(rec) })
  }
  return rows
}

// 插件自带的服务不在 config.toml 里，`codex mcp remove` 删不掉；与 Claude 侧插件服务一样不列。
function isCodexPluginServer(transport: unknown): boolean {
  const cwd = (transport as Record<string, unknown> | null)?.cwd
  return typeof cwd === 'string' && /[\\/]plugins[\\/]cache[\\/]/.test(cwd)
}

function codexTarget(transport: unknown): ConnectorTarget | null {
  if (!transport || typeof transport !== 'object') {
    return null
  }
  const t = transport as Record<string, unknown>
  if (typeof t.url === 'string') {
    return { transport: 'http', url: t.url }
  }
  if (typeof t.command === 'string') {
    const args = Array.isArray(t.args) ? t.args.filter((a) => typeof a === 'string') : []
    return { transport: 'stdio', command: t.command, args: args as string[] }
  }
  return null
}

function codexState(rec: Record<string, unknown>): ConnectorProbe {
  if (rec.enabled === false) {
    return { state: 'disabled' }
  }
  switch (rec.auth_status) {
    case 'not_logged_in':
      return { state: 'needs-auth' }
    case 'o_auth':
    case 'bearer_token':
      return { state: 'logged-in' }
    case 'unsupported':
      return { state: 'no-auth' }
    default:
      return { state: 'unknown' }
  }
}

/** 不带 repoId 时只读两家的「所有项目」一级；带了就在该项目主检出目录下读。 */
export const ConnectorListRequestSchema = z.strictObject({ repoId: z.string().min(1).optional() })
export type ConnectorListRequest = z.infer<typeof ConnectorListRequestSchema>

export type ConnectorAgentRow = { name: string; target: string } & ConnectorProbe

/** missing = 本机找不到该 CLI；error = 跑了但超时、退出码非 0 或输出认不出。 */
export type ConnectorAgentListing =
  | { status: 'ok'; rows: ConnectorAgentRow[] }
  | { status: 'missing' }
  | { status: 'error'; message: string }

export type ConnectorListResult = {
  /** 实际读状态的目录；null = 用户主目录（没选项目或项目不在本机）。 */
  projectPath: string | null
  /** 读 Codex 用的目录，也是安装类 Codex 命令要写的目录（Orca 同步来源）。 */
  codexHome: string
  claude: ConnectorAgentListing
  codex: ConnectorAgentListing
}

export function describeConnectorTarget(target: ConnectorTarget | null): string {
  if (!target) {
    return ''
  }
  return target.transport === 'stdio' ? [target.command, ...target.args].join(' ') : target.url
}

export type ConnectorRow = {
  name: string
  /** 两家写法不同时以 Claude Code 的为准，只作展示。 */
  target: string
  agents: Partial<Record<ConnectorAgent, ConnectorAgentRow>>
}

/** 按名称合并两家列表；同名即同一个 connector，各工具的状态分开保留。 */
export function mergeConnectorRows(result: ConnectorListResult): ConnectorRow[] {
  const byName = new Map<string, ConnectorRow>()
  for (const agent of ['claude', 'codex'] as const) {
    const listing = result[agent]
    if (listing.status !== 'ok') {
      continue
    }
    for (const row of listing.rows) {
      const merged = byName.get(row.name) ?? { name: row.name, target: row.target, agents: {} }
      merged.agents[agent] = row
      byName.set(row.name, merged)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}
