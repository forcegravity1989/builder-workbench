import { describe, expect, it } from 'vitest'
import { classifyKbDocGroup, sortKbDocs } from './knowledge-doc-classify'
import type { KbDoc } from './knowledge-doc-registry'

describe('classifyKbDocGroup', () => {
  it('classifies user and engineering roles with generic heuristics', () => {
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
  })

  it('classifies principles and active features', () => {
    expect(classifyKbDocGroup('docs/01-principles/vision.md')).toBe('eng-principles')
    expect(classifyKbDocGroup('docs/05-features/foo/intent.md')).toBe('eng-features')
    expect(classifyKbDocGroup('docs/architecture.md')).toBe('eng-contract')
  })

  it('excludes non-KB paths', () => {
    expect(classifyKbDocGroup('src/main/index.ts')).toBeNull()
    expect(classifyKbDocGroup('tests/AGENTS.md')).toBeNull()
    expect(classifyKbDocGroup('docs/site/README.md')).toBeNull()
    expect(classifyKbDocGroup('docs/review-evidence/pr-19217/README.md')).toBeNull()
  })
})

describe('sortKbDocs', () => {
  it('orders by KB group then registry path', () => {
    const docs: KbDoc[] = [
      {
        id: 'b',
        group: 'eng-features',
        name: 'b',
        path: 'docs/05-features/z.md',
        lede: '',
        body: ''
      },
      {
        id: 'a',
        group: 'eng-contract',
        name: 'a',
        path: 'docs/architecture.md',
        lede: '',
        body: ''
      }
    ]
    expect(sortKbDocs(docs).map((d) => d.id)).toEqual(['a', 'b'])
  })
})
