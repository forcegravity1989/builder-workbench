import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { text } from 'node:stream/consumers'
import { shouldReadRemoteCliStdin } from '../../relay/remote-cli-stdin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:stream/consumers', () => ({ text: vi.fn() }))

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
    vi.unstubAllEnvs()
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
  it('uses Orca stdin forwarding for SSH drafts instead of reading a remote path on the client', async () => {
    call.mockResolvedValue({
      id: 'test',
      ok: true,
      result: { ok: true, value: {} },
      _meta: { runtimeId: 'test' }
    })
    vi.mocked(text).mockResolvedValue(JSON.stringify(document))
    const args = [
      'bw',
      'materials',
      'save',
      ...target,
      '--host-id',
      'ssh:server',
      '--version',
      'v0.5',
      '--create',
      '--input-stdin',
      '--json'
    ]
    expect(shouldReadRemoteCliStdin(args)).toBe(true)
    await main(args, directory)
    expect(process.exitCode).toBeUndefined()
    expect(call).toHaveBeenCalledWith(
      'workbench.materials.save',
      expect.objectContaining({ hostId: 'ssh:server', document })
    )
    await main([...args, '--input', '/remote/draft.json'], directory)
    expect(process.exitCode).toBe(1)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['plan', 'local'],
    ['acceptance', 'ssh:server']
  ] as const)('reads the %s dynamic context from its native owner', async (workflow, hostId) => {
    vi.stubEnv('ORCA_WORKTREE_ID', 'tree-1')
    const response = (result: unknown) => ({
      id: 'context',
      ok: true,
      result,
      _meta: { runtimeId: 'test' }
    })
    const worktree = {
      id: 'tree-1',
      repoId: 'repo-1',
      projectId: 'project-1',
      hostId,
      path: '/workspace',
      branch: `refs/heads/bw/v0.8/${workflow}`,
      workbenchVersionBinding: { schema: 1, workflow, version: 'v0.8' }
    }
    const values: Record<string, unknown> = {
      'worktree.show': { worktree },
      'worktree.list': {
        worktrees: [
          worktree,
          { ...worktree, hostId: 'ssh:other', path: '/other' },
          {
            ...worktree,
            id: 'archived',
            isArchived: true,
            workbenchVersionBinding: { schema: 1, workflow, version: 'v0.7.9' }
          },
          {
            ...worktree,
            id: 'other-project',
            projectId: 'project-2',
            workbenchVersionBinding: { schema: 1, workflow, version: 'v0.7.8' }
          }
        ],
        truncated: false
      },
      'workbench.materials.read': { ok: true, value: null },
      'workbench.history.list': { ok: true, value: { records: [], problems: [] } },
      'workbench.materials.context': { ok: true, value: { version: 'v0.8' } },
      'workbench.history.listTreePlans': {
        ok: true,
        value: {
          head: 'abc',
          plans: [],
          problems: [{ version: 'v0.6', code: 'migration-required', message: 'old plan source' }]
        }
      },
      'workbench.materials.list': {
        ok: true,
        value: [{ version: 'v0.7', state: 'invalid', error: 'broken JSON' }]
      }
    }
    call.mockImplementation(async (method: string) => {
      if (!(method in values)) {
        throw new Error(`unexpected ${method}`)
      }
      return response(values[method])
    })
    await main(
      [
        'bw',
        'materials',
        'context',
        '--workflow',
        workflow,
        ...(workflow === 'acceptance' ? ['--host-id', hostId] : []),
        '--json'
      ],
      directory
    )
    expect(process.exitCode).toBeUndefined()
    if (workflow === 'plan') {
      expect(call).toHaveBeenCalledWith('worktree.show', { worktree: 'id:tree-1' })
    }
    expect(call).toHaveBeenCalledWith('worktree.list', { limit: 10_000 })
    const result = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
    expect(result).toMatchObject({
      version: 'v0.8',
      context: {
        repoId: 'repo-1',
        projectId: 'project-1',
        hostId,
        workflow,
        worktreeId: 'tree-1',
        workspacePath: '/workspace',
        version: 'v0.8',
        branch: `bw/v0.8/${workflow}`
      }
    })

    expect(result.candidates).toEqual([{ version: 'v0.7', state: 'invalid', error: 'broken JSON' }])
    if (workflow === 'acceptance') {
      expect(result.planSources.problems).toEqual([
        { version: 'v0.6', code: 'migration-required', message: 'old plan source' }
      ])
      expect(result.planSources.head).toBe('abc')
    } else {
      expect(result.priorReview).toEqual({ kind: 'missing', version: 'v0.7' })

      const original = call.getMockImplementation()!
      call.mockImplementation(async (method: string, params: unknown) =>
        method === 'workbench.materials.read'
          ? response({
              ok: false,
              error: { code: 'source-unavailable', message: 'fixed source unreadable' }
            })
          : original(method, params)
      )
      await main(['bw', 'materials', 'context', '--workflow', workflow, '--json'], directory)
      const failed = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
      expect(failed.priorReview).toEqual({ kind: 'error', reason: 'fixed source unreadable' })
    }

    expect(call).toHaveBeenCalledWith('workbench.materials.context', {
      repoId: 'repo-1',
      worktreeId: 'tree-1',
      hostId,
      workflow
    })
  })

  it('rejects ambiguous explicit identity and retains native context failures', async () => {
    vi.stubEnv('ORCA_WORKTREE_ID', 'tree-1')
    call.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        worktrees: [],
        worktree: {
          id: 'tree-1',
          repoId: 'repo-1',
          hostId: 'local',
          path: '/workspace',
          branch: 'bw/week-plan'
        }
      },
      _meta: { runtimeId: 'test' }
    })
    await main(
      ['bw', 'materials', 'context', '--repo-id', 'repo-1', '--workflow', 'plan', '--json'],
      directory
    )
    expect(process.exitCode).toBe(1)
    expect(call).not.toHaveBeenCalled()
    process.exitCode = undefined
    await main(
      ['bw', 'materials', 'context', ...target, '--host-id', 'ssh:other', '--json'],
      directory
    )
    expect(process.exitCode).toBe(1)
    expect(call).toHaveBeenCalledTimes(1)
    call.mockClear()
    process.exitCode = undefined
    call.mockImplementation(async (method: string) => {
      if (method === 'worktree.show') {
        return {
          id: 'test',
          ok: true,
          result: {
            worktree: {
              id: 'tree-1',
              repoId: 'repo-1',
              hostId: 'local',
              path: '/workspace',
              branch: 'bw/week-plan'
            }
          },
          _meta: { runtimeId: 'test' }
        }
      }
      return {
        id: 'test',
        ok: true,
        result: { ok: false, error: { code: 'invalid-scope', message: 'owner unavailable' } },
        _meta: { runtimeId: 'test' }
      }
    })
    await main(['bw', 'materials', 'context', ...target, '--json'], directory)
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).error).toMatchObject({
      code: 'invalid-scope',
      message: 'owner unavailable'
    })
  })
})
