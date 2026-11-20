import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RuntimeAccessAudit } from './runtime-access-audit'

describe('RuntimeAccessAudit', () => {
  it('writes metadata-only entries and filters them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shared-host-audit-'))
    const audit = new RuntimeAccessAudit(root)
    audit.record({
      at: Date.now(),
      deviceId: 'device-1',
      deviceName: 'Builder B',
      accessMode: 'team-read',
      method: 'worktree.list',
      result: 'allowed',
      requestId: 'req-1'
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    const entries = await audit.list({ result: 'allowed', search: 'Builder' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.method).toBe('worktree.list')
    const contents = await readFile(
      join(audit.getDirectory(), `${new Date().toISOString().slice(0, 10)}.ndjson`),
      'utf8'
    )
    expect(contents).not.toContain('shell')
  })

  it('removes files older than the 14-day retention window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shared-host-audit-retention-'))
    const audit = new RuntimeAccessAudit(root)
    audit.record({
      at: Date.now(),
      deviceId: 'device-1',
      accessMode: 'full',
      method: 'status.get',
      result: 'allowed'
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    const oldFile = join(audit.getDirectory(), '2020-01-01.ndjson')
    await writeFile(oldFile, '{}\n')
    await utimes(oldFile, new Date(2020, 0, 1), new Date(2020, 0, 1))
    expect(await audit.list()).toHaveLength(1)
    await expect(readFile(oldFile)).rejects.toThrow()
  })
})
