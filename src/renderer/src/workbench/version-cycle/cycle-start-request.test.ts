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
    // #431：注入句是用户口吻文本，不带 CLI 命令；转换方法指针归 SKILL/SYSTEM 侧。
    expect(text).not.toContain('ORCA skills get')
    expect(text).toContain('完成后重新读取并同步当前选版')
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
