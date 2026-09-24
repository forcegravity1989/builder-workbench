import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../runtime-client', () => ({
  RuntimeClient: class {
    isRemote = true
    call = call
  }
}))
import { main } from '../index'

describe('version material CLI entry', () => {
  let directory: string
  const target = ['--repo-id', 'repo-1', '--worktree-id', 'tree-1', '--workflow', 'plan']
  const document = {
    schema_version: 3,
    version: 'v0.5',
    cycleId: 'week-1',
    summary: { progress: '', risks: '' },
    goals: [],
    tasks: []
  }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bw-material-cli-'))
    call.mockReset()
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    process.exitCode = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('allows paired clients and routes explicit create through native RPC, with no implicit version', async () => {
    call.mockResolvedValue({
      id: 'test',
      ok: true,
      result: { ok: true, value: [] },
      _meta: { runtimeId: 'test' }
    })
    await main(['bw', 'materials', 'list', ...target, '--json'], directory)
    expect(call).toHaveBeenLastCalledWith('workbench.materials.list', {
      repoId: 'repo-1',
      worktreeId: 'tree-1',
      hostId: 'local',
      workflow: 'plan'
    })
    await writeFile(join(directory, 'draft.json'), JSON.stringify(document))
    await main(
      [
        'bw',
        'materials',
        'save',
        ...target,
        '--version',
        'v0.5',
        '--input',
        'draft.json',
        '--create',
        '--json'
      ],
      directory
    )
    expect(call).toHaveBeenLastCalledWith('workbench.materials.save', {
      repoId: 'repo-1',
      worktreeId: 'tree-1',
      hostId: 'local',
      workflow: 'plan',
      version: 'v0.5',
      expectedRevision: null,
      document
    })
    expect(process.exitCode).toBeUndefined()
    const count = call.mock.calls.length
    await main(['bw', 'materials', 'schema', '--workflow', 'acceptance', '--json'], directory)
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0])).toMatchObject({
      type: 'object',
      properties: { schema_version: { const: 3 }, planRef: { oneOf: expect.any(Array) } }
    })
    expect(call).toHaveBeenCalledTimes(count)
    await main(['bw', 'materials', 'read', ...target, '--json'], directory)
    expect(process.exitCode).toBe(1)
    expect(call).toHaveBeenCalledTimes(count)
  })

  it('returns a nonzero conflict with current revision and preserves the input draft', async () => {
    const revision = `sha256:${'a'.repeat(64)}`
    const currentRevision = `sha256:${'b'.repeat(64)}`
    call.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        ok: false,
        error: { code: 'revision-conflict', message: 'Reread before merging', currentRevision }
      },
      _meta: { runtimeId: 'test' }
    })
    const input = JSON.stringify(document)
    await writeFile(join(directory, 'draft.json'), input)
    await main(
      [
        'bw',
        'materials',
        'save',
        ...target,
        '--version',
        'v0.5',
        '--input',
        'draft.json',
        '--expected-revision',
        revision,
        '--json'
      ],
      directory
    )
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0])).toMatchObject({
      ok: false,
      error: { code: 'revision-conflict', data: { currentRevision } }
    })
    expect(await readFile(join(directory, 'draft.json'), 'utf8')).toBe(input)
  })
})
