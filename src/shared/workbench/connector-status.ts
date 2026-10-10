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
 * `claude mcp list` 的行形如 `name: target - ✔ Connected`。名称取第一个 `: `
 * 之前，状态取最后一个 ` - ` 之后——目标里可能含 ` - `，名称里不会含 `: `。
 */
export function parseClaudeMcpList(
  stdout: string
): Map<string, ConnectorProbe & { target: string }> {
  const out = new Map<string, ConnectorProbe & { target: string }>()
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    const colon = line.indexOf(': ')
    const dash = line.lastIndexOf(' - ')
    if (colon <= 0 || dash <= colon) {
      continue
    }
    const name = line.slice(0, colon)
    if (!isValidConnectorName(name)) {
      continue
    }
    out.set(name, { ...claudeStatus(line.slice(dash + 3)), target: line.slice(colon + 2, dash) })
  }
  return out
}

function claudeStatus(text: string): ConnectorProbe {
  if (/Connected/i.test(text) && !/Failed/i.test(text)) {
    return { state: 'connected' }
  }
  if (/Needs authentication/i.test(text)) {
    return { state: 'needs-auth' }
  }
  if (/Pending approval/i.test(text)) {
    return { state: 'pending-approval' }
  }
  const failed = /Failed to connect\s*[—-]?\s*(.*)$/i.exec(text)
  if (failed) {
    return { state: 'failed', detail: failed[1]?.trim() || undefined }
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
    rows.push({ name: rec.name, target: codexTarget(rec.transport), ...codexState(rec) })
  }
  return rows
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
