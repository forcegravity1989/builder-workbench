import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SUITE_DIRS,
  areaOf,
  baselineText,
  compare,
  parseBaseline,
  summarize
} from './check-vitest-count-ratchet.mjs'

describe('parseBaseline', () => {
  it('reads the monica count past header comments', () => {
    expect(parseBaseline('# comment\n\nmonica 262\n')).toBe(262)
  })

  it.each([
    ['empty text', ''],
    ['comment only', '# monica 10\n'],
    ['wrong key', 'overlay 10'],
    ['non-numeric count', 'monica abc'],
    ['missing count', 'monica'],
    ['negative count', 'monica -3']
  ])('rejects malformed baseline: %s', (_label, text) => {
    expect(parseBaseline(text)).toBeNull()
  })
})

describe('baselineText', () => {
  it('round-trips through parseBaseline', () => {
    expect(parseBaseline(baselineText(149))).toBe(149)
  })
})

describe('areaOf', () => {
  it('maps each suite directory to its area', () => {
    expect(areaOf('src/main/monica/x.test.ts')).toBe('main')
    expect(areaOf('src/relay/monica/x.test.ts')).toBe('relay')
    expect(areaOf('src/renderer/src/monica/x.test.ts')).toBe('renderer')
    expect(areaOf('src/shared/monica/x.test.ts')).toBe('shared')
    expect(SUITE_DIRS.map((dir) => areaOf(`${dir}/x.test.ts`))).toEqual([
      'main',
      'relay',
      'renderer',
      'shared'
    ])
  })
})

describe('summarize', () => {
  const root = path.join(path.sep, 'repo')

  function reportFile(rel, count) {
    return {
      name: path.join(root, ...rel.split('/')),
      assertionResults: Array.from({ length: count }, () => ({}))
    }
  }

  it('totals per area and sorts files by count desc then path', () => {
    const s = summarize(
      {
        numTotalTests: 10,
        numFailedTests: 0,
        testResults: [
          reportFile('src/main/monica/b.test.ts', 2),
          reportFile('src/main/monica/a.test.ts', 5),
          reportFile('src/renderer/src/monica/c.test.tsx', 3)
        ]
      },
      root
    )
    expect(s.total).toBe(10)
    expect(s.perArea).toEqual({ main: 7, relay: 0, renderer: 3, shared: 0 })
    expect(s.perFile.map((f) => f.rel)).toEqual([
      'src/main/monica/a.test.ts',
      'src/renderer/src/monica/c.test.tsx',
      'src/main/monica/b.test.ts'
    ])
    expect(s.perFile.every((f) => !f.rel.includes('\\'))).toBe(true)
  })

  it('tolerates an empty report', () => {
    const s = summarize({ numTotalTests: 0, numFailedTests: 0, testResults: [] }, root)
    expect(s).toMatchObject({ total: 0, failed: 0, perFile: [] })
  })
})

describe('compare', () => {
  it('reports over, under and at baseline', () => {
    expect(compare(263, 262)).toBe('over')
    expect(compare(261, 262)).toBe('under')
    expect(compare(262, 262)).toBe('ok')
  })
})
