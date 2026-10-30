import { describe, expect, it } from 'vitest'
import {
  coerceWorktreeCardVisibleTitle,
  getWorktreeCardTitleDisplay
} from './worktree-card-title-display'

const linkedIssue = {
  provider: 'github' as const,
  type: 'issue' as const,
  number: 383,
  title: 'Repair sidebar rendering',
  url: 'https://github.com/acme/app/issues/383'
}

describe('worktree card title display', () => {
  it('keeps custom workspace titles', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: '我的协作工作区',
        displayNameMode: 'fixed',
        branchName: 'feature/custom',
        linkedWorkItem: linkedIssue,
        issueTitle: 'A newer Issue title'
      })
    ).toBe('我的协作工作区')
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'Custom workspace',
        branchName: 'feature/custom',
        reviewTitle: 'Fix stale PR'
      })
    ).toBe('Custom workspace')

    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: '  Custom workspace  ',
        branchName: 'feature/custom',
        reviewTitle: 'Fix stale PR'
      })
    ).toBe('  Custom workspace  ')
  })

  it('uses linked work titles instead of repeating the branch as the card title', () => {
    for (const storedDisplayName of [
      'feature/local-branch',
      'issue-383-repair-sidebar-rendering',
      'repair-sidebar-rendering',
      'Repair sidebar rendering'
    ]) {
      expect(
        getWorktreeCardTitleDisplay({
          storedDisplayName,
          displayNameMode: 'automatic',
          branchName: 'feature/local-branch',
          linkedWorkItem: linkedIssue,
          issueTitle: 'Loading issue...'
        })
      ).toBe('#383 Repair sidebar rendering')
      expect(
        getWorktreeCardTitleDisplay({
          storedDisplayName,
          displayNameMode: 'fixed',
          branchName: 'feature/local-branch',
          linkedWorkItem: linkedIssue,
          issueTitle: 'A newer Issue title'
        })
      ).toBe(storedDisplayName)
    }
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'feature/local-branch',
        branchName: 'feature/local-branch',
        linkedWorkItem: linkedIssue,
        issueTitle: 'Updated sidebar title'
      })
    ).toBe('#383 Updated sidebar title')
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'feature/local-branch',
        branchName: 'feature/local-branch',
        reviewTitle: 'Fix stale GH PR'
      })
    ).toBe('Fix stale GH PR')
  })

  it('keeps the stored title while linked titles are still loading', () => {
    for (const provider of ['github', 'gitlab', 'codehub'] as const) {
      expect(
        getWorktreeCardTitleDisplay({
          storedDisplayName: 'feature/local-branch',
          branchName: 'feature/local-branch',
          linkedWorkItem: { ...linkedIssue, provider, title: '侧栏主机显示' },
          issueTitle: 'Issue details unavailable'
        })
      ).toBe('#383 侧栏主机显示')
    }
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'feature/local-branch',
        branchName: 'feature/local-branch',
        reviewTitle: 'Loading PR...'
      })
    ).toBe('feature/local-branch')
  })

  it('keeps the stored title when there is no linked work title', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'feature/local-branch',
        branchName: 'feature/local-branch'
      })
    ).toBe('feature/local-branch')
  })

  it('does not replace a branch-like workspace name with the repository name', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'test454545',
        branchName: 'test454545'
      })
    ).toBe('test454545')
  })

  it('uses linked work titles when the stored title is nullish and the branch is usable', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: undefined,
        branchName: 'feature/local-branch',
        reviewTitle: 'Fix stale GH PR'
      })
    ).toBe('Fix stale GH PR')

    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: null,
        branchName: 'feature/local-branch',
        issueTitle: 'Fix stale issue'
      })
    ).toBe('Fix stale issue')
  })

  it('uses Jira issue titles when the card title would otherwise be the branch', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'feature/orca-123',
        branchName: 'feature/orca-123',
        jiraIssueTitle: 'Link Jira from create'
      })
    ).toBe('Link Jira from create')
  })

  it('treats blank stored titles as absent', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: '   ',
        branchName: 'feature/local-branch'
      })
    ).toBe('')

    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: '',
        branchName: 'feature/local-branch',
        linearIssueTitle: 'Fix stale Linear issue'
      })
    ).toBe('Fix stale Linear issue')
  })

  it('skips linked-title replacement when the branch name is nullish or blank', () => {
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'issue-383-old-title',
        displayNameMode: 'automatic',
        branchName: undefined,
        linkedWorkItem: { ...linkedIssue, number: 385, title: '新关联标题' },
        issueTitle: 'Loading issue...'
      })
    ).toBe('#385 新关联标题')
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: '我的离线工作区',
        displayNameMode: 'fixed',
        branchName: undefined,
        linkedWorkItem: linkedIssue
      })
    ).toBe('我的离线工作区')
    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: 'Custom workspace',
        branchName: undefined,
        reviewTitle: 'Fix stale GH PR'
      })
    ).toBe('Custom workspace')

    expect(
      getWorktreeCardTitleDisplay({
        storedDisplayName: null,
        branchName: '   ',
        reviewTitle: 'Fix stale GH PR'
      })
    ).toBe('')
  })

  it('coerces legacy visible titles before downstream title operations', () => {
    expect(coerceWorktreeCardVisibleTitle(undefined).trim()).toBe('')
    expect(coerceWorktreeCardVisibleTitle(null).trim()).toBe('')
    expect(coerceWorktreeCardVisibleTitle('  Custom workspace  ')).toBe('  Custom workspace  ')
  })
})
