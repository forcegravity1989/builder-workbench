/**
 * 项目名片 `.bw/project.toml` 纯函数核心：解析/渲染/保真补空/URL 归一化。
 * renderer（预填探测）与 main（bw/project 固定树写入与 PR 流）共用同一份实现。
 */
import { parse } from 'smol-toml'

export const PROJECT_TOML_REL = '.bw/project.toml'
export const BW_GITIGNORE_REL = '.bw/.gitignore'
/** 项目约定固定树分支；工作树落 <仓>/.bw/worktrees/project。 */
export const CHARTER_BRANCH = 'bw/project'

export type ProjectCharter = {
  name: string
  kind: string
  brief: string
  benchmark: string
  /** UI「目标方向」；仓文件字段名 opportunity */
  opportunity: string
  /** 项目群绑定（[chat] 表）；provider 非 welink 或缺 group_id 时视为未配置，不装值。 */
  chat?: ProjectCharterChat
}

/** `.bw/project.toml [chat]` 表：项目群绑定，pr-review-notify 方案一消费。 */
export type ProjectCharterChat = {
  provider: 'welink'
  groupId: string
  /** 沿用既有语义（merged/release 通知），本特性不消费；坏值省略不炸整份名片。 */
  notify?: string[]
}

export const EMPTY_CHARTER: ProjectCharter = {
  name: '',
  kind: '',
  brief: '',
  benchmark: '',
  opportunity: ''
}

function unquote(raw: string): string {
  const t = raw.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return t
}

function quote(value: string): string {
  return JSON.stringify(value)
}

/** 顶层文字字段（[chat] 表不参与字符串字段循环与保真补空）。 */
export type CharterStringField = Exclude<keyof ProjectCharter, 'chat'>

const CHARTER_FIELD_KEYS: readonly { field: CharterStringField; keys: readonly string[] }[] = [
  { field: 'name', keys: ['name'] },
  { field: 'kind', keys: ['kind'] },
  { field: 'brief', keys: ['brief'] },
  { field: 'benchmark', keys: ['benchmark'] },
  // north_star 是 opportunity 的历史别名；已有该键时原位补值，不另插 opportunity。
  { field: 'opportunity', keys: ['opportunity', 'north_star'] }
]

/** Minimal TOML top-level string fields plus the optional [chat] table. */
export function parseProjectToml(raw: string): ProjectCharter {
  const out: ProjectCharter = { ...EMPTY_CHARTER }
  const source = parse(raw)
  for (const field of CHARTER_FIELD_KEYS.map((entry) => entry.field)) {
    const value = source[field] ?? (field === 'opportunity' ? source.north_star : undefined)
    if (value === undefined) {
      continue
    }
    if (typeof value !== 'string') {
      throw new Error(`名片字段 ${field} 不是文字`)
    }
    out[field] = value
  }
  const chat = parseChatTable(source.chat)
  if (chat) {
    out.chat = chat
  }
  return out
}

/** [chat] 只在 provider=welink 且 group_id 为非空文字时成立；其余形态按未配置处理。 */
function parseChatTable(raw: unknown): ProjectCharterChat | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  const table = raw as Record<string, unknown>
  const groupId = table.group_id
  if (table.provider !== 'welink' || typeof groupId !== 'string' || !groupId.trim()) {
    return null
  }
  const notify = table.notify
  return {
    provider: 'welink',
    groupId: groupId.trim(),
    ...(Array.isArray(notify) && notify.every((item) => typeof item === 'string')
      ? { notify: notify as string[] }
      : {})
  }
}

export function renderProjectToml(file: ProjectCharter): string {
  return [
    `name = ${quote(file.name)}`,
    `kind = ${quote(file.kind)}`,
    `brief = ${quote(file.brief)}`,
    `benchmark = ${quote(file.benchmark)}`,
    `opportunity = ${quote(file.opportunity)}`,
    '',
    '# 项目群没配。配了就在这里加一段 [chat]。',
    ''
  ].join('\n')
}

function topLevelKeyOf(line: string): { key: string; value: string } | null {
  const t = line.trim()
  if (!t || t.startsWith('#') || t.startsWith('[')) {
    return null
  }
  const eq = t.indexOf('=')
  if (eq <= 0) {
    return null
  }
  return { key: t.slice(0, eq).trim(), value: unquote(t.slice(eq + 1)) }
}

/**
 * 已有名片只补空字段：在原文件文本上原位替换/插入，注释、[chat] 等
 * 其余内容逐字保留（main 09e2b1a83 的教训：整份重渲染会抹掉人写的内容）。
 */
export function fillBlankCharterInToml(
  raw: string,
  intent: ProjectCharter
): { content: string; filled: string[] } {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  let tableStart = lines.findIndex((l) => l.trim().startsWith('['))
  if (tableStart < 0) {
    // 无表头时插到结尾换行产生的末尾空行之前，保住文件的收尾换行。
    tableStart = lines.at(-1) === '' ? lines.length - 1 : lines.length
  }
  const filled: string[] = []
  for (const { field, keys } of CHARTER_FIELD_KEYS) {
    const wanted = intent[field].trim()
    if (!wanted) {
      continue
    }
    // 与 parseProjectToml 同语义：重复键后者生效，只动最后一个匹配行。
    let lastIdx = -1
    let lastKey = ''
    let lastValue = ''
    for (let i = 0; i < tableStart; i++) {
      const parsed = topLevelKeyOf(lines[i])
      if (parsed && keys.includes(parsed.key)) {
        lastIdx = i
        lastKey = parsed.key
        lastValue = parsed.value
      }
    }
    if (lastIdx >= 0) {
      if (lastValue.trim()) {
        continue
      }
      lines[lastIdx] = `${lastKey} = ${quote(wanted)}`
      filled.push(field)
    } else {
      lines.splice(tableStart, 0, `${keys[0]} = ${quote(wanted)}`)
      tableStart += 1
      filled.push(field)
    }
  }
  return { content: lines.join(eol), filled }
}

export function joinFsPath(parent: string, name: string): string {
  const sep = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`
}

export function repoNameFromRemote(remote: string): string {
  const cleaned = remote
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  const parts = cleaned.split(/[/:]/)
  return parts.at(-1) || 'repo'
}

export function normalizeCloneUrl(input: string): string {
  const t = input.trim()
  if (!t) {
    return ''
  }
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(t)) {
    return `https://github.com/${t}.git`
  }
  return t
}
