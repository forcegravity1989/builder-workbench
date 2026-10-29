import { describe, expect, it } from 'vitest'
import { editProjectToml } from './project-charter-edit'
import {
  EMPTY_CHARTER,
  fillBlankCharterInToml,
  normalizeCloneUrl,
  parseProjectToml,
  renderProjectToml,
  repoNameFromRemote
} from './project-charter'

describe('project-charter', () => {
  it('parses and renders round-trip fields', () => {
    const raw = `name = "workbench"
kind = ""
brief = "一张工作台"
benchmark = "Linear"
opportunity = "纳入更多项目"

# comment
`
    const parsed = parseProjectToml(raw)
    expect(parsed.name).toBe('workbench')
    expect(parsed.brief).toBe('一张工作台')
    expect(parsed.opportunity).toBe('纳入更多项目')
    const again = parseProjectToml(renderProjectToml(parsed))
    expect(again).toEqual(parsed)
    expect(normalizeCloneUrl('stablyai/orca')).toBe('https://github.com/stablyai/orca.git')
    expect(repoNameFromRemote('https://github.com/stablyai/orca.git')).toBe('orca')
  })

  it('parses the [chat] table alongside top-level fields', () => {
    const parsed = parseProjectToml(`name = "workbench"

[chat]
provider = "welink"
group_id = "996840920634630304"
notify = ["merged", "release"]
`)
    expect(parsed.chat).toEqual({
      provider: 'welink',
      groupId: '996840920634630304',
      notify: ['merged', 'release']
    })
  })

  it('treats a malformed [chat] table as unconfigured without failing the charter', () => {
    const base = 'name = "workbench"\n'
    // provider 非 welink、缺 group_id、notify 坏值：均按未配置处理，顶层字段照常解析。
    expect(
      parseProjectToml(`${base}\n[chat]\nprovider = "slack"\ngroup_id = "1"\n`).chat
    ).toBeUndefined()
    expect(parseProjectToml(`${base}\n[chat]\nprovider = "welink"\n`).chat).toBeUndefined()
    expect(
      parseProjectToml(`${base}\n[chat]\nprovider = "welink"\ngroup_id = "1"\nnotify = 3\n`).chat
    ).toEqual({ provider: 'welink', groupId: '1' })
  })

  it('fills only blank fields in place, keeping existing values', () => {
    const raw = `name = "a"
kind = ""
brief = ""
benchmark = "x"
opportunity = ""
`
    const { content, filled } = fillBlankCharterInToml(raw, {
      ...EMPTY_CHARTER,
      name: 'b',
      brief: 'want',
      benchmark: 'y',
      opportunity: 'star'
    })
    expect(filled.sort()).toEqual(['brief', 'opportunity'])
    const parsed = parseProjectToml(content)
    expect(parsed.name).toBe('a')
    expect(parsed.brief).toBe('want')
    expect(parsed.benchmark).toBe('x')
    expect(parsed.opportunity).toBe('star')
    {
      const raw = `name = "a"\r\nbrief = "b"\r\n`
      const { content, filled } = fillBlankCharterInToml(raw, {
        ...EMPTY_CHARTER,
        name: 'other',
        brief: 'other'
      })
      expect(filled).toEqual([])
      expect(content).toBe(raw)
    }
  })

  it('keeps comments and [chat] verbatim and inserts missing keys before tables', () => {
    const raw = `# 人写的注释
name = "a"

[chat]
provider = "welink"
group = "12345"
`
    const { content, filled } = fillBlankCharterInToml(raw, {
      ...EMPTY_CHARTER,
      name: 'ignored',
      brief: '补一句'
    })
    expect(filled).toEqual(['brief'])
    expect(content).toContain('# 人写的注释')
    expect(content).toContain('[chat]')
    expect(content).toContain('provider = "welink"')
    const chatIdx = content.indexOf('[chat]')
    expect(content.indexOf('brief = "补一句"')).toBeLessThan(chatIdx)
    expect(content.indexOf('name = "ignored"')).toBe(-1)
  })

  it('preserves legacy keys and final newlines when filling blanks', () => {
    const raw = `name = "a"
north_star = ""
`
    const { content, filled } = fillBlankCharterInToml(raw, {
      ...EMPTY_CHARTER,
      name: 'a',
      opportunity: 'star'
    })
    expect(filled).toEqual(['opportunity'])
    expect(content).toContain('north_star = "star"')
    expect(content).not.toContain('opportunity =')
    {
      const raw = `name = "a"\n`
      const { content, filled } = fillBlankCharterInToml(raw, {
        ...EMPTY_CHARTER,
        name: 'a',
        brief: 'b'
      })
      expect(filled).toEqual(['brief'])
      expect(content).toBe(`name = "a"\nbrief = "b"\n`)
    }
  })

  it('edits only reviewed values while preserving aliases, comments, multiline data and CRLF', () => {
    const raw = [
      '# keep',
      'name = "  a  " # identity',
      'brief = "old" # summary',
      "north_star = '''old",
      '[literal]',
      "vision''' # direction",
      'custom = 12',
      '',
      '[chat]',
      'group = "untouched"',
      ''
    ].join('\r\n')
    const before = parseProjectToml(raw)
    const { content, changed } = editProjectToml(raw, raw, {
      ...before,
      brief: 'new\nline',
      opportunity: ''
    })
    expect(changed).toEqual(['brief', 'opportunity'])
    expect(content).toContain('name = "  a  " # identity')
    expect(content).toContain('brief = "new\\nline" # summary')
    expect(content).toContain('north_star = "" # direction')
    expect(content).toContain('custom = 12\r\n\r\n[chat]\r\ngroup = "untouched"\r\n')
    expect(parseProjectToml(content)).toEqual({ ...before, brief: 'new\nline', opportunity: '' })
  })

  it('rejects stale, invalid and nameless edits before producing a write', () => {
    const raw = 'name = "a"\n'
    const intent = { ...EMPTY_CHARTER, name: 'b' }
    expect(() => editProjectToml(raw, null, intent)).toThrow('已变化')
    expect(() => editProjectToml(raw, raw, { ...intent, name: '' })).toThrow('不能为空')
    expect(() => editProjectToml('name = [', 'name = [', intent)).toThrow()
    expect(() => parseProjectToml('name = 3')).toThrow('不是文字')
    const created = editProjectToml(null, null, intent)
    expect(parseProjectToml(created.content).name).toBe('b')
  })
})
