import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, primaryIssues, isExempt, inspectPullRequest } from './pr-issue-audit.mjs'

const repository = { full_name: 'owner/repo', url: 'https://api.github.com/repos/owner/repo' }
const pr = {
  number: 8,
  body: '关联 #7',
  head: { sha: 'a', ref: 'codex/change', repo: repository },
  base: { ref: 'main', repo: repository }
}
const issue = { number: 7, state: 'closed', repository_url: repository.url }
const run = (change = {}) => evaluate({ pr, issues: [issue], ...change })
const fromBranch = (ref) => ({ ...pr, head: { ...pr.head, ref } })

test('primary issue list ignores template comments, supports multiple issues and removes duplicates', () => {
  assert.deepEqual(
    primaryIssues('<!-- template -->\n\n关联： #7、#9，#7（参考 #12）\n背景 #13'),
    [7, 9]
  )
  assert.deepEqual(primaryIssues('关联 #7, #9'), [7, 9])
})
test('missing, background-only or malformed primary references fail', () => {
  for (const body of [
    null,
    '',
    '背景 #7',
    '标题\n关联 #7',
    '关联 #',
    '关联 #0',
    '关联 #7、#',
    '关联 other/repo#7'
  ]) {
    assert.equal(run({ pr: { ...pr, body } }).status, 'failed', String(body))
  }
})
test('each primary reference must be an actual readable Issue, not a PR', () => {
  assert.equal(run({ issues: [] }).findings[0].code, 'invalid-issue')
  assert.equal(run({ issues: [{ ...issue, pull_request: {} }] }).status, 'failed')
  assert.equal(
    run({ issues: [{ ...issue, repository_url: 'https://api.github.com/repos/other/repo' }] })
      .status,
    'failed'
  )
  assert.equal(run({ pr: { ...pr, body: '关联 #7、#9' } }).status, 'failed')
})
test('existing closed Issues pass without inspecting dates, title or commit history', () => {
  assert.equal(
    run({
      pr: {
        ...pr,
        title: 'Fixes #7',
        body: '关联 #7\nCloses #7',
        created_at: '2020-01-01',
        commits: 251
      },
      issues: [{ ...issue, created_at: '2026-11-12' }]
    }).status,
    'passed'
  )
})
test('only the supported same-repository fixed workflow branches are exempt', () => {
  for (const branch of [
    'bw/project',
    'bw/metrics-refresh',
    'bw/week-plan',
    'bw/week-acceptance',
    'bw/v0.9/plan',
    'bw/v1.0/acceptance'
  ]) {
    const result = run({ pr: { ...fromBranch(branch), body: null }, issues: [] })
    assert.equal(result.status, 'passed', branch)
    assert.equal(result.exempt, true, branch)
  }
  for (const branch of [
    'bw/feature',
    'bw/project-fix',
    'bw/metrics',
    'bw/v1.0/code',
    'bw/v1.0/plan/fix',
    'codex/change'
  ]) {
    assert.equal(isExempt(fromBranch(branch)), false, branch)
  }
  assert.equal(
    isExempt({
      ...fromBranch('bw/project'),
      head: { ...fromBranch('bw/project').head, repo: { full_name: 'fork/repo' } }
    }),
    false
  )
})
test('live inspection reads only the referenced Issues and accepts a closed Issue', async () => {
  const paths = []
  const result = await inspectPullRequest(
    async (path) => {
      paths.push(path)
      return path === 'pulls/8' ? pr : issue
    },
    8,
    'a'
  )
  assert.equal(result.status, 'passed')
  assert.deepEqual(paths, ['pulls/8', 'issues/7', 'pulls/8'])
})
test('exempt PRs do not request Issue or commit evidence', async () => {
  const paths = []
  const result = await inspectPullRequest(async (path) => {
    paths.push(path)
    return { ...fromBranch('bw/project'), body: null }
  }, 8)
  assert.equal(result.exempt, true)
  assert.deepEqual(paths, ['pulls/8', 'pulls/8'])
})
test('unreadable Issues fail; API failures cannot become a successful check', async () => {
  const result = await inspectPullRequest(async (path) => (path === 'pulls/8' ? pr : null), 8)
  assert.equal(result.status, 'failed')
  await assert.rejects(
    inspectPullRequest(async () => {
      throw new Error('GitHub 503')
    }, 8),
    /GitHub 503/
  )
})
test('outdated head or changed association during inspection cannot pass', async () => {
  await assert.rejects(
    inspectPullRequest(async () => pr, 8, 'old'),
    /head 已更新/
  )
  let reads = 0
  await assert.rejects(
    inspectPullRequest(async (path) => {
      if (path !== 'pulls/8') {
        return issue
      }
      return ++reads === 1 ? pr : { ...pr, body: null }
    }, 8),
    /PR 内容或来源分支已变化/
  )
})
