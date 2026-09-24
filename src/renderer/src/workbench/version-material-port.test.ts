import { beforeEach, expect, it, vi } from 'vitest'
const call = vi.hoisted(() => vi.fn())
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: call }))
import { nativeVersionMaterialPort } from './version-material-port'

beforeEach(() => {
  call.mockReset().mockResolvedValue({ ok: true, value: [] })
})

it.each([
  ['local', undefined, { kind: 'local' }, 'local'],
  ['ssh:server', undefined, { kind: 'local' }, 'ssh:server'],
  ['local', 'paired', { kind: 'environment', environmentId: 'paired' }, 'local'],
  ['ssh:server', 'paired', { kind: 'environment', environmentId: 'paired' }, 'ssh:server'],
  ['runtime:paired', undefined, { kind: 'environment', environmentId: 'paired' }, 'local']
] as const)(
  'routes %s via owner %s without changing the SSH namespace',
  async (hostId, owner, target, ownerHost) => {
    await nativeVersionMaterialPort(
      { repoId: 'repo', worktreeId: 'tree', workflow: 'plan', hostId },
      owner
    ).list()
    expect(call).toHaveBeenCalledWith(target, 'workbench.materials.list', {
      repoId: 'repo',
      worktreeId: 'tree',
      workflow: 'plan',
      hostId: ownerHost
    })
  }
)

it('returns material conflict details without changing a caller draft', async () => {
  call.mockResolvedValue({
    ok: false,
    error: { code: 'revision-conflict', message: 'Changed', currentRevision: 'sha256:current' }
  })
  await expect(
    nativeVersionMaterialPort({
      repoId: 'repo',
      worktreeId: 'tree',
      workflow: 'plan',
      hostId: 'local'
    }).read('v0.5')
  ).rejects.toMatchObject({ code: 'revision-conflict', currentRevision: 'sha256:current' })
})
