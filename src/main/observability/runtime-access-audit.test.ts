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

  it('keeps one line for a burst of the same refusal and logs it again after the window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shared-host-audit-repeat-'))
    const audit = new RuntimeAccessAudit(root)
    const base = {
      deviceId: 'device-1',
      accessMode: 'team-read' as const,
      method: 'terminal.send',
      result: 'denied' as const
    }
    const now = Date.now()
    audit.record({ ...base, at: now })
    audit.record({ ...base, at: now + 5_000 })
    audit.record({ ...base, at: now + 30_000 })
    audit.record({ ...base, method: 'files.write', at: now + 31_000 })
    audit.record({ ...base, at: now + 61_000 })
    audit.record({ ...base, result: 'allowed', method: 'worktree.sleep', at: now + 1 })
    audit.record({ ...base, result: 'allowed', method: 'worktree.sleep', at: now + 2 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const entries = await audit.list()
    expect(entries.filter((e) => e.method === 'terminal.send')).toHaveLength(2)
    expect(entries.filter((e) => e.method === 'files.write')).toHaveLength(1)
    expect(entries.filter((e) => e.method === 'worktree.sleep')).toHaveLength(2)
  })

  it('does not merge failures with different causes, devices or results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shared-host-audit-causes-'))
    const audit = new RuntimeAccessAudit(root)
    const base = {
      at: Date.now(),
      deviceId: 'device-1',
      accessMode: 'team-read' as const,
      method: 'terminal.create',
      result: 'error' as const,
      errorCode: 'runtime_error'
    }
    audit.record({ ...base, errorMessage: 'spawn_failed' })
    audit.record({ ...base, errorMessage: 'bad_cwd' })
    audit.record({ ...base, errorMessage: 'bad_cwd', deviceId: 'device-2' })
    audit.record({ ...base, errorMessage: 'bad_cwd', result: 'denied' })
    audit.record({ ...base, errorMessage: 'bad_cwd', at: base.at + 1_000 })
    audit.record({ ...base, errorMessage: 'bad_cwd', at: base.at - 120_000 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const entries = await audit.list()
    expect(entries).toHaveLength(5)
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
