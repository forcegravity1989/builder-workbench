import { parse } from 'smol-toml'
import { renderProjectToml, type ProjectCharter } from './project-charter'

export const EDITABLE_CHARTER_FIELDS = ['name', 'brief', 'benchmark', 'opportunity'] as const

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
    return { content: renderProjectToml(intent), changed: [...EDITABLE_CHARTER_FIELDS] }
  }
  const parsed = parse(raw)
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const assignments = new Map<
    string,
    { start: number; end: number; prefix: string; comment: string }
  >()
  let insertion = lines.length - (lines.at(-1) === '' ? 1 : 0)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim().startsWith('[')) {
      insertion = index
      break
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
    assignments.set(Object.keys(value)[0], { start: index, end, prefix: match[1], comment })
    index = end
  }
  const replacements: { start: number; end: number; text: string }[] = []
  const additions: string[] = []
  const changed: string[] = []
  for (const field of EDITABLE_CHARTER_FIELDS) {
    const key =
      field === 'opportunity' && !('opportunity' in parsed) && 'north_star' in parsed
        ? 'north_star'
        : field
    const previous = parsed[key] ?? ''
    if (typeof previous !== 'string') {
      throw new Error(`名片字段 ${key} 不是文字，原文件未改动`)
    }
    const next = intent[field].trim()
    if (previous.trim() === next) {
      continue
    }
    const assignment = assignments.get(key)
    const value = JSON.stringify(next)
    if (assignment) {
      replacements.push({
        ...assignment,
        text: `${assignment.prefix}${value}${assignment.comment}`
      })
    } else {
      additions.push(`${key} = ${value}`)
    }
    changed.push(field)
  }
  lines.splice(insertion, 0, ...additions)
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    lines.splice(replacement.start, replacement.end - replacement.start + 1, replacement.text)
  }
  const content = lines.join(eol)
  parse(content)
  return { content, changed }
}
