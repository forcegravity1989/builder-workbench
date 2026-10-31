import { describe, expect, it } from 'vitest'
import { classifyKbDocGroup } from './knowledge-doc-classify'

// 环 4 ratchet 对冲（#516）：同一纯函数的三条薄用例合并为一条，全部断言原样保留。
describe('classifyKbDocGroup', () => {
  it('classifies user/engineering roles and principles, and excludes non-KB paths', () => {
    expect(classifyKbDocGroup('docs/site/content/docs/activity.mdx')).toBe('user-docs')
    expect(classifyKbDocGroup('docs/readme/README.zh-CN.md')).toBe('user-readme')
    expect(classifyKbDocGroup('README.md')).toBe('user-readme')
    expect(classifyKbDocGroup('docs/STYLEGUIDE.md')).toBe('eng-contract')
    expect(classifyKbDocGroup('docs/reference/ssh-execution-boundary.md')).toBe('eng-contract')
    expect(classifyKbDocGroup('docs/reference/orcad-operations.md')).toBe('eng-reference')
    expect(classifyKbDocGroup('docs/relay-region-correction/RELAY-REGION-CORRECTION-PLAN.md')).toBe(
      'eng-features'
    )
    expect(classifyKbDocGroup('cloud/docs/relay-improvement-roadmap-2026-09.md')).toBe(
      'eng-features'
    )
    expect(classifyKbDocGroup('AGENTS.md')).toBe('eng-agents')
    expect(classifyKbDocGroup('.bw/project.toml')).toBe('eng-bw')
    expect(classifyKbDocGroup('docs/01-principles/vision.md')).toBe('eng-principles')
    expect(classifyKbDocGroup('docs/05-features/foo/intent.md')).toBe('eng-features')
    expect(classifyKbDocGroup('docs/architecture.md')).toBe('eng-contract')
    expect(classifyKbDocGroup('src/main/index.ts')).toBeNull()
    expect(classifyKbDocGroup('tests/AGENTS.md')).toBeNull()
    expect(classifyKbDocGroup('docs/site/README.md')).toBeNull()
    expect(classifyKbDocGroup('docs/review-evidence/pr-19217/README.md')).toBeNull()
  })
})
