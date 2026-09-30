import { describe, expect, it } from 'vitest'
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

  it('fills the legacy north_star key in place instead of inserting opportunity', () => {
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
  })

  it('inserts missing keys before the trailing newline when there is no table', () => {
    const raw = `name = "a"\n`
    const { content, filled } = fillBlankCharterInToml(raw, {
      ...EMPTY_CHARTER,
      name: 'a',
      brief: 'b'
    })
    expect(filled).toEqual(['brief'])
    expect(content).toBe(`name = "a"\nbrief = "b"\n`)
  })

  it('returns content untouched when nothing is blank to fill', () => {
    const raw = `name = "a"\r\nbrief = "b"\r\n`
    const { content, filled } = fillBlankCharterInToml(raw, {
      ...EMPTY_CHARTER,
      name: 'other',
      brief: 'other'
    })
    expect(filled).toEqual([])
    expect(content).toBe(raw)
  })

  it('normalizes github shorthand and repo name', () => {
    expect(normalizeCloneUrl('stablyai/orca')).toBe('https://github.com/stablyai/orca.git')
    expect(repoNameFromRemote('https://github.com/stablyai/orca.git')).toBe('orca')
  })
})
