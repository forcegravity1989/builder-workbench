import { describe, expect, it } from 'vitest'
import { KB_INITIAL_NOTES } from './knowledge-demo-data'
import { gapMark, openGapCount, openGapsOfDoc } from './knowledge-gap-utils'

describe('knowledge-gap-utils', () => {
  it('counts open gaps', () => {
    expect(openGapCount()).toBeGreaterThan(0)
  })

  it('marks doc with open gaps', () => {
    const mark = gapMark('nse-spec', KB_INITIAL_NOTES)
    expect(mark.openCount).toBeGreaterThan(0)
  })

  it('finds architecture unknown gap', () => {
    const gaps = openGapsOfDoc('architecture')
    expect(gaps.some((g) => g.state === 'unknown')).toBe(true)
  })
})
