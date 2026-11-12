import { parse } from 'smol-toml'
import { renderProjectToml, type ProjectCharter } from './project-charter'

export const EDITABLE_CHARTER_FIELDS = [
  'name',
  'owner',
  'brief',
  'benchmark',
  'opportunity',
  'groupId'
] as const

/** Apply reviewed edits to the exact read revision, preserving unrelated TOML text. */
export function editProjectToml(
  raw: string | null,
  expectedRaw: string | null,
  intent: ProjectCharter
): { content: string; changed: string[] } {
  if (raw !== expectedRaw) {
    throw new Error('项目信息已变化，草稿已保留；重新读取并核对后再提交')
  }
  if (!intent.name.trim()) {
    throw new Error('项目名称不能为空')
  }
  if (raw === null) {
    return {
      content: renderProjectToml(intent),
      changed: EDITABLE_CHARTER_FIELDS.filter(
        (field) => field !== 'groupId' || Boolean(intent.groupId)
      )
    }
  }
  const parsed = parse(raw)
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const assignments = new Map<
    string,
    { start: number; end: number; prefix: string; comment: string }
  >()
  const endOfFile = lines.length - (lines.at(-1) === '' ? 1 : 0)
  let insertion = endOfFile
  let chatInsertion: number | null = null
  let table: 'root' | 'chat' | 'other' = 'root'
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim().startsWith('[')) {
      if (table === 'root') {
        insertion = index
      } else if (table === 'chat') {
        chatInsertion = index
      }
      table = /^\s*\[\s*(?:chat|"chat"|'chat')\s*\]\s*(?:#.*)?$/.test(line) ? 'chat' : 'other'
      if (table === 'chat') {
        chatInsertion = endOfFile
      }
      continue
    }
    const match = /^(\s*(?:[\w-]+|"[^"\n]+"|'[^'\n]+')\s*=\s*)/.exec(line)
    if (!match) {
      continue
    }
    let end = index
    let value: Record<string, unknown> | null = null
    while (end < lines.length) {
      try {
        value = parse(lines.slice(index, end + 1).join('\n'))
        break
      } catch {
        end++
      }
    }
    if (!value) {
      throw new Error('名片字段无法安全编辑，原文件未改动')
    }
    let comment = ''
    const fragment = lines.slice(index, end + 1).join('\n')
    for (let hash = fragment.indexOf('#'); hash >= 0; hash = fragment.indexOf('#', hash + 1)) {
      try {
        parse(fragment.slice(0, hash))
        comment = ` ${fragment.slice(hash)}`
        break
      } catch {
        // A # inside a string is part of the value, not a trailing comment.
      }
    }
    if (table !== 'other') {
      const field = Object.keys(value)[0]
      assignments.set(`${table}:${field}`, {
        start: index,
        end,
        prefix: match[1],
        comment
      })
    }
    index = end
  }
  const replacements: { start: number; end: number; text: string }[] = []
  const additions: string[] = []
  const chatAdditions: string[] = []
  const changed: string[] = []
  const chat = parsed.chat
  const storedGroupId =
    chat && typeof chat === 'object' && 'group_id' in chat ? chat.group_id : undefined
  for (const field of EDITABLE_CHARTER_FIELDS) {
    if (field === 'groupId' && intent.groupId === undefined) {
      continue
    }
    const key =
      field === 'groupId'
        ? 'group_id'
        : field === 'opportunity' && !('opportunity' in parsed) && 'north_star' in parsed
          ? 'north_star'
          : field
    const previous = (field === 'groupId' ? storedGroupId : parsed[key]) ?? ''
    if (typeof previous !== 'string') {
      throw new Error(`名片字段 ${key} 不是文字，原文件未改动`)
    }
    const next = (intent[field] ?? '').trim()
    if (previous.trim() === next) {
      continue
    }
    const assignment = assignments.get(`${field === 'groupId' ? 'chat' : 'root'}:${key}`)
    const value = JSON.stringify(next)
    if (assignment) {
      replacements.push({
        ...assignment,
        text: `${assignment.prefix}${value}${assignment.comment}`
      })
    } else if (field === 'groupId') {
      if (chatInsertion === null && chat !== undefined) {
        throw new Error('请先在名片文件的 [chat] 段核对项目群配置，原文件未改动')
      }
      chatAdditions.push(`group_id = ${value}`)
    } else {
      additions.push(`${key} = ${value}`)
    }
    changed.push(field)
  }
  if (chatAdditions.length) {
    const start = chatInsertion ?? endOfFile
    const text = chatInsertion === null ? ['', '[chat]', ...chatAdditions] : chatAdditions
    replacements.push({ start, end: start - 1, text: text.join(eol) })
  }
  if (additions.length) {
    replacements.push({ start: insertion, end: insertion - 1, text: additions.join(eol) })
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    lines.splice(replacement.start, replacement.end - replacement.start + 1, replacement.text)
  }
  const content = lines.join(eol)
  parse(content)
  return { content, changed }
}
