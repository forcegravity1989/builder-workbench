import { describe, expect, it } from 'vitest'
import { mapCodeHubGateChecks, mapCodeHubMrChanges, parseCodeHubPatch } from './codehub-mr-detail'

describe('mapCodeHubGateChecks', () => {
  it('maps codehub states onto github check status/conclusion pairs', () => {
    const checks = mapCodeHubGateChecks([
      { name: 'default/Data-Security-Check', state: 'success', link: 'https://check/1' },
      { name: 'build', state: 'failed' },
      { name: 'deploy', state: 'running' },
      { name: 'scan', state: 'pending' },
      { name: 'audit', state: 'canceled' },
      { name: 'weird', state: 'mystery' }
    ])
    expect(checks).toEqual([
      {
        name: 'default/Data-Security-Check',
        status: 'completed',
        conclusion: 'success',
        url: 'https://check/1'
      },
      { name: 'build', status: 'completed', conclusion: 'failure', url: null },
      { name: 'deploy', status: 'in_progress', conclusion: null, url: null },
      { name: 'scan', status: 'queued', conclusion: null, url: null },
      { name: 'audit', status: 'completed', conclusion: 'cancelled', url: null },
      { name: 'weird', status: 'completed', conclusion: 'neutral', url: null }
    ])
  })

  it('drops non-array input and rows without a name', () => {
    expect(mapCodeHubGateChecks(null)).toEqual([])
    expect(mapCodeHubGateChecks([{ state: 'success' }])).toEqual([])
  })
})

describe('mapCodeHubMrChanges', () => {
  it('maps change rows onto github file shapes with the patch carried through', () => {
    const files = mapCodeHubMrChanges([
      {
        file_path: 'a.txt',
        new_path: 'a.txt',
        old_path: 'a.txt',
        added_lines: 3,
        removed_lines: 1,
        diff: '@@ -1 +1 @@\n-old\n+new\n ctx'
      },
      { new_path: 'b.txt', new_file: true, added_lines: 1, diff: '@@ -0,0 +1 @@\n+hi\n' },
      {
        new_path: 'c.txt',
        old_path: 'old-c.txt',
        renamed_file: true,
        added_lines: 0,
        removed_lines: 0
      },
      { new_path: 'logo.png', binary: true }
    ])
    expect(files).toEqual([
      {
        path: 'a.txt',
        oldPath: undefined,
        status: 'modified',
        additions: 3,
        deletions: 1,
        isBinary: false,
        patch: '@@ -1 +1 @@\n-old\n+new\n ctx'
      },
      {
        path: 'b.txt',
        oldPath: undefined,
        status: 'added',
        additions: 1,
        deletions: 0,
        isBinary: false,
        patch: '@@ -0,0 +1 @@\n+hi\n'
      },
      {
        path: 'c.txt',
        oldPath: 'old-c.txt',
        status: 'renamed',
        additions: 0,
        deletions: 0,
        isBinary: false,
        patch: ''
      },
      {
        path: 'logo.png',
        oldPath: undefined,
        status: 'modified',
        additions: 0,
        deletions: 0,
        isBinary: true,
        patch: ''
      }
    ])
  })
})

describe('parseCodeHubPatch', () => {
  it('rebuilds both sides from hunks, keeping context lines on both', () => {
    const { original, modified } = parseCodeHubPatch('@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n tail')
    expect(original).toBe('ctx\nold\ntail')
    expect(modified).toBe('ctx\nnew\ntail')
  })

  it('yields an empty original for a brand-new file and skips no-newline markers', () => {
    const { original, modified } = parseCodeHubPatch(
      '@@ -0,0 +1 @@\n+hi\n\\ No newline at end of file'
    )
    expect(original).toBe('')
    expect(modified).toBe('hi')
  })

  it('returns empty contents for an empty patch', () => {
    expect(parseCodeHubPatch('')).toEqual({ original: '', modified: '' })
  })
})
