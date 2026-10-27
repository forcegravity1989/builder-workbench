import { describe, expect, it } from 'vitest'
import { parseTaskQuery } from '../task-query'
import {
  matchesWorkbenchTaskQuery,
  hasUnsupportedWorkbenchTaskSearch,
  removeWorkbenchVersionQuery,
  seedWorkbenchTaskQuery,
  type WorkbenchTaskScope
} from './task-scope'

const scope: WorkbenchTaskScope = { version: 'v0.7', references: [] }

describe('native task entry filters', () => {
  it('adds and removes the version label without losing existing native qualifiers', () => {
    const original = 'is:pr state:all author:alice label:"needs review" "quoted text"'
    const seeded = seedWorkbenchTaskQuery(original, scope)
    expect(parseTaskQuery(seeded)).toEqual({
      ...parseTaskQuery(original),
      labels: ['needs review', 'bw:plan:v0.7']
    })
    expect(seedWorkbenchTaskQuery(seeded, scope)).toBe(seeded)
    expect(
      parseTaskQuery(seedWorkbenchTaskQuery(seeded, { ...scope, version: 'v0.8' }, scope)).labels
    ).toEqual(['needs review', 'bw:plan:v0.8'])
    expect(parseTaskQuery(removeWorkbenchVersionQuery(seeded, scope))).toEqual(
      parseTaskQuery(original)
    )
  })

  it('filters the complete goal set using native Issue qualifiers and never infers PR membership', () => {
    const items = Array.from({ length: 68 }, (_, index) => ({
      number: index + 1,
      title: 'API result',
      state: index === 65 ? 'open' : 'closed',
      author: 'alice',
      assignees: ['bob'],
      labels: ['bw:plan:v0.7']
    }))
    const query = 'is:issue is:open author:@me assignee:bob label:bw:plan:v0.7 API'
    expect(
      items
        .filter((item) => matchesWorkbenchTaskQuery(item, query, 'alice'))
        .map((item) => item.number)
    ).toEqual([66])
    expect(items.filter((item) => matchesWorkbenchTaskQuery(item, query, null))).toEqual([])
    expect(
      items.filter((item) => matchesWorkbenchTaskQuery(item, 'is:pr state:all', 'alice'))
    ).toEqual([])
    expect(matchesWorkbenchTaskQuery({ ...items[65], labels: [] }, query, 'alice')).toBe(false)
    expect(matchesWorkbenchTaskQuery(items[65], '#66', 'alice')).toBe(true)
    expect(hasUnsupportedWorkbenchTaskSearch('in:title API')).toBe(true)
    expect(hasUnsupportedWorkbenchTaskSearch('"in:title"')).toBe(false)
    expect(hasUnsupportedWorkbenchTaskSearch('API OR result')).toBe(true)
  })
})
