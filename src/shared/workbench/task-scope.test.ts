import { describe, expect, it } from 'vitest'
import type { Repo } from '../repository/repo-types'
import { parseTaskQuery } from '../work-items/task-query'
import {
  matchesWorkbenchTaskQuery,
  hasUnsupportedWorkbenchTaskSearch,
  removeWorkbenchVersionQuery,
  seedWorkbenchTaskQuery,
  workbenchTaskEntryQuery,
  workbenchGoalMutationQuery,
  type WorkbenchTaskScope
} from './task-scope'
import {
  githubIssueAssignmentTarget,
  linkedIssueRepository,
  nextIssueVersionMembership,
  resolveMemberGoalId,
  sameIssueLink
} from './version-membership'

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
    const multipleAuthors = parseTaskQuery('author:alice author:@me')
    expect(workbenchGoalMutationQuery(multipleAuthors, true).authors).toEqual([])
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
    expect(matchesWorkbenchTaskQuery(items[65], 'author:other author:@me', 'alice')).toBe(true)
    expect(matchesWorkbenchTaskQuery(items[65], 'author:other author:@me', 'bob')).toBe(false)
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

    const goalIds = new Set(['G1', 'G2'])
    expect(resolveMemberGoalId('【v0.7|G1】项目墙', 'v0.7', goalIds)).toBe('G1')
    expect(resolveMemberGoalId(' 【v0.7｜ G2 】迁移', 'v0.7', goalIds)).toBe('G2')
    expect(resolveMemberGoalId('【v0.8|G1】其他版本', 'v0.7', goalIds)).toBeUndefined()
    expect(resolveMemberGoalId('【v0.7|G9】未列出的目标', 'v0.7', goalIds)).toBeUndefined()
    expect(resolveMemberGoalId('【特性#334】执行', 'v0.7', goalIds)).toBeUndefined()

    const moved = nextIssueVersionMembership({
      title: '【v0.7|G1】【特性#334】执行',
      labels: ['bug', 'bw:plan:v0.7'],
      version: 'v1.2',
      goalId: 'G3'
    })
    expect(moved).toEqual({
      title: '【v1.2|G3】【特性#334】执行',
      labels: ['bug', 'bw:plan:v0.7', 'bw:plan:v1.2'],
      titleChanged: true,
      addedLabel: 'bw:plan:v1.2'
    })
    expect(
      nextIssueVersionMembership({
        title: '绑定窗口',
        labels: [],
        version: 'v1.2',
        goalId: 'G3'
      }).title
    ).toBe('【v1.2|G3】绑定窗口')
    expect(
      nextIssueVersionMembership({
        title: '【v1.2|G3】绑定窗口',
        labels: ['bw:plan:v0.7', 'bw:plan:v1.2'],
        version: 'v1.2',
        goalId: 'G3'
      })
    ).toMatchObject({
      titleChanged: false,
      addedLabel: null,
      labels: ['bw:plan:v0.7', 'bw:plan:v1.2']
    })
    expect(githubIssueAssignmentTarget('https://github.com/origin/app/issues/12', 12)).toEqual({
      owner: 'origin',
      repo: 'app',
      host: 'github.com'
    })
    expect(githubIssueAssignmentTarget('https://github.com/upstream/app/issues/12', 12)).toEqual({
      owner: 'upstream',
      repo: 'app',
      host: 'github.com'
    })
    expect(githubIssueAssignmentTarget('https://github.com/origin/app/issues/12', 13)).toBeNull()
    expect(githubIssueAssignmentTarget('https://github.com/origin/app/pull/12', 12)).toBeNull()
    expect(linkedIssueRepository('https://github.com/upstream/app/issues/12', 'github', 12)).toBe(
      'upstream/app'
    )
    expect(
      linkedIssueRepository('https://github.com/upstream/app/issues/12', 'github', 13)
    ).toBeNull()
    expect(
      sameIssueLink(
        'https://github.com/upstream/app/issues/12',
        'https://github.com/origin/app/issues/12',
        'github',
        12
      )
    ).toBe(false)
    expect(
      sameIssueLink(
        'https://github.com/upstream/app/issues/12',
        'https://github.com/upstream/app/issues/12',
        'github',
        12
      )
    ).toBe(true)
    expect(
      linkedIssueRepository('https://codehub-g.huawei.com/Org/Group/repo/issues/12', 'codehub', 12)
    ).toBe('codehub-g.huawei.com/org/group/repo')
    const enterprise = {
      id: 'ghes',
      path: '/projects/ghes',
      displayName: 'ghes',
      badgeColor: '',
      addedAt: 0,
      gitRemoteIdentity: {
        canonicalKey: 'github.example.com/owner/project',
        remoteName: 'origin',
        remoteUrl: 'https://github.example.com:8443/owner/project.git'
      }
    } as Repo
    const enterpriseUrl = 'https://github.example.com:8443/owner/project/issues/8'
    expect(linkedIssueRepository(enterpriseUrl, 'github', 8)).toBeNull()
    expect(linkedIssueRepository(enterpriseUrl, 'github', 8, [enterprise])).toBe(
      'github.example.com/owner/project'
    )
    expect(sameIssueLink(enterpriseUrl, enterpriseUrl, 'github', 8, [enterprise])).toBe(true)
    expect(
      sameIssueLink(
        enterpriseUrl,
        'https://github.example.com:8443/other/project/issues/8',
        'github',
        8,
        [enterprise]
      )
    ).toBe(false)
  })
})
