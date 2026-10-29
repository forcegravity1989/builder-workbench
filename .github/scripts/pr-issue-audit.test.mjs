import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, primaryIssues, closingReferences } from './pr-issue-audit.mjs'

const issue = { number: 7, created_at: '2026-10-20T00:00:00Z' }
const commit = {
  sha: 'a',
  parents: [{}],
  commit: {
    author: { date: '2026-10-21T00:00:00Z' },
    committer: { date: '2026-10-21T00:00:00Z' },
    message: '关联 #7'
  }
}
const pr = {
  number: 8,
  title: '修复读取',
  body: '关联 #7',
  created_at: '2026-10-22T00:00:00Z',
  commits: 1,
  head: { sha: 'a' }
}
const run = (change = {}) => evaluate({ pr, commits: [commit], issues: [issue], ...change })

test('only the leading explicit local issue list is primary', () => {
  assert.deepEqual(
    primaryIssues('<!-- template -->\n关联 #7、#9（后续参考 #12）\n背景 #13'),
    [7, 9]
  )
  assert.deepEqual(primaryIssues('背景 #7'), [])
  assert.deepEqual(primaryIssues('关联 https://github.com/other/repo/issues/7'), [])
})
test('an existing earlier issue can be reused without new feature documents', () =>
  assert.equal(run().status, 'passed'))
test('background references do not replace a primary issue', () =>
  assert.equal(run({ pr: { ...pr, body: '背景 #7' } }).status, 'failed'))
test('a PR number cannot be used as the issue', () =>
  assert.equal(run({ issues: [{ ...issue, pull_request: {} }] }).status, 'failed'))
test('late issue remains late after association is repaired', () => {
  const result = run({ issues: [{ ...issue, created_at: '2026-10-23T00:00:00Z' }] })
  assert.deepEqual(
    result.findings.map((f) => f.code),
    ['issue-after-pr', 'issue-after-commit']
  )
})
test('rebasing cannot hide an author date before the issue', () => {
  const result = run({
    commits: [{ ...commit, commit: { ...commit.commit, author: { date: '2026-10-19T00:00:00Z' } } }]
  })
  assert.equal(result.findings[0].code, 'issue-after-commit')
})
test('merge uses its own creation time without importing parent author history', () => {
  const result = run({
    pr: { ...pr, commits: 2 },
    commits: [
      commit,
      {
        ...commit,
        parents: [{}, {}],
        commit: { ...commit.commit, author: { date: '2026-01-01T00:00:00Z' } }
      }
    ]
  })
  assert.equal(result.status, 'passed')
  const earlyMerge = {
    ...commit,
    parents: [{}, {}],
    commit: { ...commit.commit, committer: { date: '2026-10-19T00:00:00Z' } }
  }
  assert.equal(run({ pr: { ...pr, commits: 2 }, commits: [commit, earlyMerge] }).status, 'failed')
})
test('closing commands in body, commit or squash title block the check', () => {
  assert.deepEqual(
    closingReferences('fix: #7; Closes other/repo#8; resolved https://github.com/o/r/issues/9'),
    ['fix: #7', 'Closes other/repo#8', 'resolved https://github.com/o/r/issues/9']
  )
  assert.equal(run({ pr: { ...pr, title: 'fix: #7' } }).status, 'failed')
  assert.equal(run({ pr: { ...pr, body: '关联 #7\nFixes #7' } }).status, 'failed')
  assert.equal(
    run({ commits: [{ ...commit, commit: { ...commit.commit, message: 'Closes #7' } }] }).status,
    'failed'
  )
})
test('truncated or unavailable commit evidence stays Unknown', () => {
  assert.equal(run({ pr: { ...pr, commits: 251 } }).status, 'unknown')
  assert.equal(run({ commits: [] }).status, 'unknown')
})
