import { describe, expect, it } from 'vitest'
import {
  fillBlankCharter,
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

  it('fills only blank fields', () => {
    const next = fillBlankCharter(
      { name: 'a', kind: '', brief: '', benchmark: 'x', opportunity: '' },
      { name: 'b', kind: '', brief: 'want', benchmark: 'y', opportunity: 'star' }
    )
    expect(next.name).toBe('a')
    expect(next.brief).toBe('want')
    expect(next.benchmark).toBe('x')
    expect(next.opportunity).toBe('star')
  })

  it('normalizes github shorthand and repo name', () => {
    expect(normalizeCloneUrl('stablyai/orca')).toBe('https://github.com/stablyai/orca.git')
    expect(repoNameFromRemote('https://github.com/stablyai/orca.git')).toBe('orca')
  })
})
