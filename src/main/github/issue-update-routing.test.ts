import type * as GhUtils from '../git/command-runner/hosted-cli/gh-exec-file'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

const { gh, codehub } = vi.hoisted(() => ({ gh: vi.fn(), codehub: vi.fn() }))
vi.mock('../git/command-runner/hosted-cli/gh-exec-file', async (load) => ({
  ...(await load<typeof GhUtils>()),
  ghExecFileAsync: gh
}))
vi.mock('../codehub/issue-state', () => ({ applyCodeHubIssueState: codehub }))
import { updateIssue } from './issues/issue-update'

it('keeps GitHub state and body on the GitHub upstream when origin is a CodeHub mirror', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'orca-forge-routing-'))
  try {
    execFileSync('git', ['init', repo], { windowsHide: true, stdio: 'ignore' })
    for (const [name, url] of [
      ['origin', 'https://codehub-g.huawei.com/mirror/project.git'],
      ['upstream', 'https://github.com/acme/project.git']
    ]) {
      execFileSync('git', ['-C', repo, 'remote', 'add', name, url], { windowsHide: true })
    }
    gh.mockResolvedValue({ stdout: '' })
    expect(await updateIssue(repo, 12, { state: 'closed', body: 'Reviewed' })).toEqual({ ok: true })
    expect(codehub).not.toHaveBeenCalled()
    expect(gh).toHaveBeenCalledWith(
      ['issue', 'close', '12', '--repo', 'acme/project'],
      expect.objectContaining({ host: 'github.com' })
    )
    expect(gh).toHaveBeenCalledWith(
      ['api', '-X', 'PATCH', 'repos/acme/project/issues/12', '--input', '-'],
      expect.objectContaining({ host: 'github.com', stdin: JSON.stringify({ body: 'Reviewed' }) })
    )
    gh.mockClear()
    expect(
      await updateIssue(
        '/unavailable/remote/checkout',
        22,
        { state: 'closed' },
        null,
        {
          taskRepository: { host: 'github.com', owner: 'team', repo: 'remote-project' }
        },
        'origin'
      )
    ).toEqual({ ok: true })
    expect(gh).toHaveBeenCalledTimes(1)
    expect(gh).toHaveBeenLastCalledWith(
      ['issue', 'close', '22', '--repo', 'team/remote-project'],
      expect.objectContaining({ host: 'github.com' })
    )
    expect(gh.mock.calls[0]?.[1]).not.toHaveProperty('cwd')
    expect(gh.mock.calls[0]?.[1]).not.toHaveProperty('wslDistro')
  } finally {
    // The parallel origin probe may still hold a Windows cwd handle after the
    // upstream result wins; allow it to close before removing the fixture.
    await rm(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
