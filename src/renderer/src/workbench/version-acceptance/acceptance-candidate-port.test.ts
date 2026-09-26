import { expect, it, vi } from 'vitest'
vi.mock('../../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
import { artifactRelativePath, createAcceptanceCandidatePort } from './acceptance-candidate-port'

const candidate = { repository: 'github.com/acme/project', version: 'v1', commit: 'a'.repeat(40) }
const scope = { repoId: 'repo', hostId: 'local' as const, worktreeId: 'acceptance' }
const repo = {
  id: 'repo',
  executionHostId: 'local',
  gitRemoteIdentity: { canonicalKey: candidate.repository }
}
const acceptance = { id: 'acceptance', repoId: 'repo', hostId: 'local', path: '/repo/acceptance' }
const source = { ...acceptance, id: 'source', path: '/repo/source' }
function runtime() {
  return vi.fn(async (method: string, params?: unknown) => {
    if (method === 'repo.list') {
      return { repos: [repo] }
    }
    if (method === 'worktree.show') {
      return {
        worktree: (params as { worktree: string }).worktree === 'id:source' ? source : acceptance
      }
    }
    if (method === 'git.commitCompare') {
      return { summary: { status: 'ready', commitOid: candidate.commit } }
    }
    if (method === 'worktree.list') {
      return { worktrees: [source], truncated: false }
    }
    if (method === 'git.status') {
      return { head: 'b'.repeat(40), entries: [] }
    }
    if (method === 'files.pathsExist') {
      return [{ exists: true }]
    }
    throw new Error(`Unexpected ${method}`)
  })
}
const artifact = {
  artifactId: 'report',
  kind: 'verification' as const,
  location: '/repo/source/report.html',
  executionRoot: '/repo/source',
  candidateRef: candidate,
  generatedAt: '2026-09-25T10:00:00Z'
}

it('rejects a candidate from another repository before Git verification', async () => {
  const rpc = runtime()
  const port = createAcceptanceCandidatePort(
    scope,
    rpc as Parameters<typeof createAcceptanceCandidatePort>[1]
  )
  expect(await port.check({ ...candidate, repository: 'github.com/other/project' })).toMatchObject({
    kind: 'mismatch'
  })
  expect(rpc.mock.calls.some(([method]) => method === 'git.commitCompare')).toBe(false)
})

it('reports an old execution HEAD separately from an available report', async () => {
  const rpc = runtime()
  const port = createAcceptanceCandidatePort(
    scope,
    rpc as Parameters<typeof createAcceptanceCandidatePort>[1]
  )
  const result = await port.inspect(artifact, candidate)
  expect(result.candidate.kind).toBe('verified')
  expect(result.availability.kind).toBe('verified')
  expect(result.execution.kind).toBe('mismatch')
  expect(result.file).toEqual({ worktreeId: 'source', relativePath: 'report.html' })
})

it('keeps disconnected or wrong-host evidence unavailable without local fallback', async () => {
  const rpc = runtime()
  rpc.mockImplementation(async (method) => {
    if (method === 'repo.list') {
      return { repos: [repo] }
    }
    if (method === 'worktree.show') {
      return { worktree: { ...source, hostId: 'ssh:other' } }
    }
    throw new Error('A mismatched host must not be read')
  })
  const port = createAcceptanceCandidatePort(
    scope,
    rpc as Parameters<typeof createAcceptanceCandidatePort>[1]
  )
  await expect(
    port.openFile({ worktreeId: 'source', relativePath: 'report.html' })
  ).rejects.toThrow('宿主不一致')
  expect(rpc.mock.calls.some(([method]) => method === 'files.open')).toBe(false)
})

it('keeps material paths inside the registered execution root', () => {
  expect(artifactRelativePath('C:\\repo\\source\\report.html', 'C:/repo/source')).toBe(
    'report.html'
  )
  expect(artifactRelativePath('../other/report.html', '/repo/source')).toBeNull()
  expect(artifactRelativePath('/repo/other/report.html', '/repo/source')).toBeNull()
  expect(artifactRelativePath('https://example.test/report.html', '/repo/source')).toBeNull()
})
