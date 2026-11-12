import { describe, expect, it } from 'vitest'
import { parseTaskQuery } from '../task-query'
import {
  matchesWorkbenchTaskQuery,
  hasUnsupportedWorkbenchTaskSearch,
  removeWorkbenchVersionQuery,
  seedWorkbenchTaskQuery,
  workbenchTaskEntryQuery,
  workbenchGoalMutationQuery,
  type WorkbenchTaskScope
} from './task-scope'
import { parseTitleGoalToken, resolveMemberGoalId } from './version-membership'

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
    const previous = { ...scope, version: 'v0.5' }
    const goal = { ...scope, version: 'v0.8', goalId: 'G3' }
    const saved = 'is:issue is:open label:bw:plan:v0.5'
    expect(workbenchTaskEntryQuery(saved, goal)).toBe('')
    expect(workbenchTaskEntryQuery(saved, goal, previous)).toBe('')
    expect(seedWorkbenchTaskQuery('label:bw:plan:v0.8', goal)).toBe('label:bw:plan:v0.8')
    const mine = parseTaskQuery('assignee:@me author:alice state:open label:bug')
    expect(workbenchGoalMutationQuery(mine, true)).toEqual({ ...mine, assignee: null })
    expect(workbenchGoalMutationQuery(mine, false)).toBe(mine)
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
    expect(matchesWorkbenchTaskQuery(items[65], 'assignee:@me state:all', 'bob')).toBe(true)
    expect(
      matchesWorkbenchTaskQuery({ ...items[65], assignees: [] }, 'assignee:@me state:all', 'bob')
    ).toBe(false)
    expect(
      items.filter((item) => matchesWorkbenchTaskQuery(item, 'is:pr state:all', 'alice'))
    ).toEqual([])
    expect(matchesWorkbenchTaskQuery({ ...items[65], labels: [] }, query, 'alice')).toBe(false)
    const goal = { ...scope, goalId: 'goal' }
    const goalQuery = workbenchTaskEntryQuery(query, goal)
    expect(items.filter((item) => matchesWorkbenchTaskQuery(item, goalQuery, null))).toHaveLength(
      68
    )
    expect(matchesWorkbenchTaskQuery({ ...items[65], labels: [] }, goalQuery, 'alice')).toBe(true)
    const filtered = seedWorkbenchTaskQuery('label:bw:plan:v0.7', goal)
    expect(matchesWorkbenchTaskQuery({ ...items[65], labels: [] }, filtered, 'alice')).toBe(false)
    expect(matchesWorkbenchTaskQuery(items[65], '#66', 'alice')).toBe(true)
    expect(hasUnsupportedWorkbenchTaskSearch('in:title API')).toBe(true)
    expect(hasUnsupportedWorkbenchTaskSearch('"in:title"')).toBe(false)
    expect(hasUnsupportedWorkbenchTaskSearch('API OR result')).toBe(true)

    // #588 标题目标段解析：成员归属由标题 `【<版本>|<目标>】` 决定。
    // 断言并入本协议用例而非新建 it，以免超出叠层 vitest 例数 ratchet（环 4）。
    expect(parseTitleGoalToken('【v0.7|G1】项目墙指标')).toBe('G1')
    expect(parseTitleGoalToken('【v0.7｜G2】迁移')).toBe('G2')
    expect(parseTitleGoalToken('【v0.7| G3 】目标')).toBe('G3')
    expect(parseTitleGoalToken('没有前缀的标题')).toBeNull()
    expect(parseTitleGoalToken('【特性#334】执行')).toBeNull()
    const goalIds = new Set(['G1', 'G2'])
    expect(resolveMemberGoalId('【v0.7|G1】项目墙', goalIds)).toBe('G1')
    expect(resolveMemberGoalId('【v0.7|G9】未列出的目标', goalIds)).toBeUndefined()
    expect(resolveMemberGoalId('随手写的标题', goalIds)).toBeUndefined()
  })
})
