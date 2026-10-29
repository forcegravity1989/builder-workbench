import { beforeEach, expect, it, vi } from 'vitest'
const call = vi.hoisted(() => vi.fn())
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: call }))
import { nativeVersionMaterialPort } from './version-material-port'

beforeEach(() => {
  call.mockReset().mockResolvedValue({ ok: true, value: [] })
})

// 环 4 ratchet 对冲：矩阵收缩到三种 target 形态各一行（local 直连、
// runtime 归 owner、owner 显式指定），删除与保留行断言完全相同的
// ['local', undefined] 平凡基线与 ['local', 'paired'] 重复行。
it.each([
  ['ssh:server', undefined, { kind: 'local' }, 'ssh:server'],
  ['runtime:paired', undefined, { kind: 'environment', environmentId: 'paired' }, 'local'],
  ['ssh:server', 'paired', { kind: 'environment', environmentId: 'paired' }, 'ssh:server']
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
