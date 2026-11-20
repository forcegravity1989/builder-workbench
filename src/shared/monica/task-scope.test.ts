import { describe, expect, it } from 'vitest'
import { parseTaskQuery } from '../task-query'
import {
  matchesMonicaTaskQuery,
  hasUnsupportedMonicaTaskSearch,
  removeMonicaVersionQuery,
  seedMonicaTaskQuery,
  monicaTaskEntryQuery,
  monicaGoalMutationQuery,
  type MonicaTaskScope
} from './task-scope'
import { resolveMemberGoalId } from './version-membership'

const scope: MonicaTaskScope = { version: 'v0.7', references: [] }

describe('native task entry filters', () => {
  it('adds and removes the version label without losing existing native qualifiers', () => {
    const original = 'is:pr state:all author:alice label:"needs review" "quoted text"'
    const seeded = seedMonicaTaskQuery(original, scope)
    expect(parseTaskQuery(seeded)).toEqual({
      ...parseTaskQuery(original),
      labels: ['needs review', 'bw:plan:v0.7']
    })
    expect(seedMonicaTaskQuery(seeded, scope)).toBe(seeded)
    expect(
      parseTaskQuery(seedMonicaTaskQuery(seeded, { ...scope, version: 'v0.8' }, scope)).labels
    ).toEqual(['needs review', 'bw:plan:v0.8'])
    expect(parseTaskQuery(removeMonicaVersionQuery(seeded, scope))).toEqual(
      parseTaskQuery(original)
    )
    const previous = { ...scope, version: 'v0.5' }
    const goal = { ...scope, version: 'v0.8', goalId: 'G3' }
    const saved = 'is:issue is:open label:bw:plan:v0.5'
    expect(monicaTaskEntryQuery(saved, goal)).toBe('')
    expect(monicaTaskEntryQuery(saved, goal, previous)).toBe('')
    expect(seedMonicaTaskQuery('label:bw:plan:v0.8', goal)).toBe('label:bw:plan:v0.8')
    const mine = parseTaskQuery('assignee:@me author:alice state:open label:bug')
    expect(monicaGoalMutationQuery(mine, true)).toEqual({ ...mine, assignee: null })
    expect(monicaGoalMutationQuery(mine, false)).toBe(mine)
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
        .filter((item) => matchesMonicaTaskQuery(item, query, 'alice'))
        .map((item) => item.number)
    ).toEqual([66])
    expect(items.filter((item) => matchesMonicaTaskQuery(item, query, null))).toEqual([])
    expect(matchesMonicaTaskQuery(items[65], 'assignee:@me state:all', 'bob')).toBe(true)
    expect(
      matchesMonicaTaskQuery({ ...items[65], assignees: [] }, 'assignee:@me state:all', 'bob')
    ).toBe(false)
    expect(
      items.filter((item) => matchesMonicaTaskQuery(item, 'is:pr state:all', 'alice'))
    ).toEqual([])
    expect(matchesMonicaTaskQuery({ ...items[65], labels: [] }, query, 'alice')).toBe(false)
    const goal = { ...scope, goalId: 'goal' }
    const goalQuery = monicaTaskEntryQuery(query, goal)
    expect(items.filter((item) => matchesMonicaTaskQuery(item, goalQuery, null))).toHaveLength(68)
    expect(matchesMonicaTaskQuery({ ...items[65], labels: [] }, goalQuery, 'alice')).toBe(true)
    const filtered = seedMonicaTaskQuery('label:bw:plan:v0.7', goal)
    expect(matchesMonicaTaskQuery({ ...items[65], labels: [] }, filtered, 'alice')).toBe(false)
    expect(matchesMonicaTaskQuery(items[65], '#66', 'alice')).toBe(true)
    expect(hasUnsupportedMonicaTaskSearch('in:title API')).toBe(true)
    expect(hasUnsupportedMonicaTaskSearch('"in:title"')).toBe(false)
    expect(hasUnsupportedMonicaTaskSearch('API OR result')).toBe(true)

    const goalIds = new Set(['G1', 'G2'])
    expect(resolveMemberGoalId('【v0.7|G1】项目墙', 'v0.7', goalIds)).toBe('G1')
    expect(resolveMemberGoalId(' 【v0.7｜ G2 】迁移', 'v0.7', goalIds)).toBe('G2')
    expect(resolveMemberGoalId('【v0.8|G1】其他版本', 'v0.7', goalIds)).toBeUndefined()
    expect(resolveMemberGoalId('【v0.7|G9】未列出的目标', 'v0.7', goalIds)).toBeUndefined()
    expect(resolveMemberGoalId('【特性#334】执行', 'v0.7', goalIds)).toBeUndefined()
  })
})
