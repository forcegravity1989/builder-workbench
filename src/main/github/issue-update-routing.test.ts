import type * as GhUtils from './gh-utils'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

const { gh, codehub } = vi.hoisted(() => ({ gh: vi.fn(), codehub: vi.fn() }))
vi.mock('./gh-utils', async (load) => ({
  ...(await load<typeof GhUtils>()),
  ghExecFileAsync: gh
}))
vi.mock('../codehub/issue-state', () => ({ applyCodeHubIssueState: codehub }))
import { updateIssue } from './issue-update'

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
      ['api', '-X', 'PATCH', 'repos/acme/project/issues/12', '--raw-field', 'body=Reviewed'],
      expect.objectContaining({ host: 'github.com' })
    )
  } finally {
    // The parallel origin probe may still hold a Windows cwd handle after the
    // upstream result wins; allow it to close before removing the fixture.
    await rm(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
