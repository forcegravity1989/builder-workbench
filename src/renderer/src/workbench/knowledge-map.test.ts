import { describe, expect, it } from 'vitest'
import {
  classifyWithMap,
  compactPathsForRole,
  parseKnowledgeMap,
  pathMatchesMapPattern,
  renderKnowledgeMap,
  type KnowledgeMap
} from './knowledge-map'

describe('pathMatchesMapPattern', () => {
  it('matches exact files and directory prefixes', () => {
    expect(pathMatchesMapPattern('docs/architecture.md', 'docs/architecture.md')).toBe(true)
    expect(pathMatchesMapPattern('docs/features/a/intent.md', 'docs/features/')).toBe(true)
    expect(pathMatchesMapPattern('docs/features/a/intent.md', 'docs/other/')).toBe(false)
  })
})

describe('parseKnowledgeMap / renderKnowledgeMap', () => {
  it('round-trips sections and exclude', () => {
    const raw = `
version = 1
status = "draft"

[[section]]
role = "eng-features"
paths = ["docs/05-features/", "docs/relay-region-correction/"]

[[section]]
role = "eng-contract"
paths = ["docs/STYLEGUIDE.md", "docs/architecture.md"]

[[exclude]]
paths = ["docs/review-evidence/"]
`
    const map = parseKnowledgeMap(raw)
    expect(map.version).toBe(1)
    expect(map.status).toBe('draft')
    expect(map.sections).toHaveLength(2)
    expect(map.sections[0].role).toBe('eng-features')
    expect(map.sections[0].paths).toEqual(['docs/05-features/', 'docs/relay-region-correction/'])
    expect(map.exclude).toEqual(['docs/review-evidence/'])

    const again = parseKnowledgeMap(renderKnowledgeMap(map))
    expect(again.sections[1].role).toBe('eng-contract')
    expect(again.exclude).toEqual(['docs/review-evidence/'])
  })
})

describe('classifyWithMap', () => {
  const map: KnowledgeMap = {
    version: 1,
    status: 'reviewed',
    sections: [
      { role: 'eng-features', paths: ['docs/05-features/'] },
      {
        role: 'eng-contract',
        paths: ['docs/STYLEGUIDE.md', 'docs/reference/ssh-execution-boundary.md']
      },
      { role: 'eng-reference', paths: ['docs/reference/'] },
      { role: 'user-docs', paths: ['docs/site/content/docs/'] }
    ],
    exclude: ['docs/review-evidence/']
  }

  it('prefers exclude', () => {
    expect(classifyWithMap('docs/review-evidence/pr-1/README.md', map)).toBeNull()
  })

  it('prefers exact over directory prefix', () => {
    expect(classifyWithMap('docs/reference/ssh-execution-boundary.md', map)).toBe('eng-contract')
    expect(classifyWithMap('docs/reference/orcad-operations.md', map)).toBe('eng-reference')
  })

  it('classifies feature and user docs', () => {
    expect(classifyWithMap('docs/05-features/foo/intent.md', map)).toBe('eng-features')
    expect(classifyWithMap('docs/site/content/docs/activity.mdx', map)).toBe('user-docs')
  })
})

describe('compactPathsForRole', () => {
  it('collapses sibling files into a directory prefix', () => {
    expect(
      compactPathsForRole([
        'docs/features/a/intent.md',
        'docs/features/a/spec.md',
        'docs/features/b/intent.md',
        'README.md'
      ])
    ).toEqual(['README.md', 'docs/features/a/', 'docs/features/b/intent.md'].sort())
  })
})
