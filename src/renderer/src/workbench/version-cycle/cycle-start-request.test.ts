import { describe, expect, it } from 'vitest'
import { materialProblemRequest } from './cycle-start-request'

describe('materialProblemRequest', () => {
  it('builds plan-workflow requests against the plan data file and keeps ready versions out', () => {
    const text = materialProblemRequest(
      [
        { version: 'v0.3', state: 'migration-required' },
        { version: 'v0.5', state: 'ready' }
      ],
      'plan',
      null
    )
    expect(text).toContain('.bw/planning/v0.3/data.json')
    expect(text).not.toContain('v0.5')
    expect(text).toContain('右侧当前未选择版本')
    expect(text).toContain('ORCA skills get week-planning --reference data-and-runtime')
  })

  it('carries the selected version and the real unreadable acceptance files into the request', () => {
    const text = materialProblemRequest(
      [
        { version: 'v0.3', state: 'migration-required' },
        { version: 'v0.4', state: 'invalid', error: 'unexpected end of JSON' }
      ],
      'acceptance',
      'v0.5'
    )
    expect(text).toContain('.bw/planning/v0.3/acceptance.json：旧格式，需要迁移')
    expect(text).toContain('.bw/planning/v0.4/acceptance.json：unexpected end of JSON')
    expect(text).toContain('右侧当前选中的版本：v0.5')
    expect(text).toContain('等我确认后执行')
  })
})
