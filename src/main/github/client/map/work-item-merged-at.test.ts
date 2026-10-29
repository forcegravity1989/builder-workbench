import { expect, it } from 'vitest'
import { mapPullRequestWorkItem } from './work-item'
import { WORK_ITEM_PR_LIST_JSON_FIELDS } from './work-item-field-coercion'

it('requests mergedAt and preserves both CLI and REST merge times without using updatedAt', () => {
  expect(WORK_ITEM_PR_LIST_JSON_FIELDS.split(',')).toEqual(
    expect.arrayContaining(['mergedAt', 'createdAt'])
  )
  for (const field of ['createdAt', 'created_at']) {
    expect(mapPullRequestWorkItem({ number: 1, [field]: '2026-09-20T10:00:00Z' }).createdAt).toBe(
      '2026-09-20T10:00:00Z'
    )
  }
  expect(mapPullRequestWorkItem({ number: 1 }).createdAt).toBeUndefined()
  for (const field of ['mergedAt', 'merged_at']) {
    expect(
      mapPullRequestWorkItem({
        number: 1,
        state: 'merged',
        [field]: '2026-09-21T00:00:00Z',
        updatedAt: '2026-09-28T00:00:00Z'
      }).mergedAt
    ).toBe('2026-09-21T00:00:00Z')
  }
  expect(
    mapPullRequestWorkItem({ number: 1, state: 'merged', updatedAt: '2026-09-28T00:00:00Z' })
      .mergedAt
  ).toBeUndefined()
})
