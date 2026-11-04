import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { SkillUploadSessionService } from '../skills/skill-upload-session-service'
import { executeSkillBundleInstallRequest } from '../skills/skill-bundle-install-request-service'
import {
  SkillBundleInstallRequestSchema,
  type SkillBundleInstallRequest
} from '../../shared/skill-bundle-install-contract'
import {
  SkillUploadBeginRequestSchema,
  SkillUploadChunkRequestSchema,
  SkillUploadCommitRequestSchema
} from '../../shared/skill-upload-session-contract'
import type {
  SkillUploadBeginRequest,
  SkillUploadChunkRequest
} from '../../shared/skill-upload-session-contract'

const relay = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../ssh/ssh-target-registry', () => ({ getActiveMultiplexer: () => relay }))
vi.mock('./workspace-resolver', () => ({
  nativeWorkbenchWorkspaceHost: (runtime: unknown) => runtime,
  createWorkbenchWorkspaceResolver: () => ({
    resolve: async (input: { hostId: string }) => ({
      target: { hostId: input.hostId },
      reauthorize: async () => undefined
    })
  })
}))
import { prepareWorkbenchSkill } from './skill-install'

const fixtures: { root: string; uploads: SkillUploadSessionService }[] = []
afterEach(async () => {
  for (const { root, uploads } of fixtures.splice(0)) {
    await uploads.dispose()
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) {
      throw new Error('Unsafe fixture root')
    }
    await rm(root, { recursive: true, force: true })
  }
  vi.clearAllMocks()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bw-skill-install-'))
  const home = join(root, 'home')
  await mkdir(home)
  const uploads = new SkillUploadSessionService(join(root, 'uploads'))
  fixtures.push({ root, uploads })
  const install = async (request: SkillBundleInstallRequest) =>
    executeSkillBundleInstallRequest(request, {
      authority: {
        environmentId: 'skill-fixture-runtime',
        homeDirectory: home,
        resolveWorktree: async () => null,
        resolveFolderWorkspace: async () => null
      },
      stateDirectory: join(root, 'state'),
      allowedDownloadOrigins: [],
      requireHttps: true,
      resolveStagedUpload: (id, identity) => uploads.take(id, identity),
      detectProviders: async () => []
    })
  const runtime = {
    resolveProjectRuntimeForWorktree: () => undefined,
    beginSkillUpload: vi.fn((request: SkillUploadBeginRequest) => uploads.begin(request)),
    appendSkillUploadChunk: vi.fn((request: SkillUploadChunkRequest) => uploads.append(request)),
    commitSkillUpload: vi.fn((id: string) => uploads.commit(id)),
    cancelSkillUpload: vi.fn((id: string) => uploads.cancel(id)),
    installSharedSkillBundleRequest: vi.fn(install)
  }
  return { root, home, runtime, uploads, install }
}
const scope = { repoId: 'project', worktreeId: 'tree', hostId: 'local' }

it.each(['week-planning', 'version-acceptance', 'metrics-refresh'] as const)(
  'installs the complete %s package without a BW checkout in the user project',
  async (topic) => {
    const { runtime } = await fixture()
    const { skillPath } = await prepareWorkbenchSkill(runtime as unknown as OrcaRuntimeService, {
      ...scope,
      topic
    })
    const body = await readFile(skillPath, 'utf8')
    expect(body).toContain('完整读取')
    expect(body).toContain('references/shared/execution.md')
    expect(body).not.toContain('skills get')
    const execution = await readFile(
      join(skillPath, '..', 'references/shared/execution.md'),
      'utf8'
    )
    expect(execution).toContain('AGENTS.md')
    if (topic === 'version-acceptance') {
      expect(await readFile(join(skillPath, '..', 'scripts/minutes-cdp.mjs'), 'utf8')).toContain(
        'WebSocket'
      )
      expect(
        await readFile(join(skillPath, '..', 'references/meeting-preparation.md'), 'utf8')
      ).toContain('先预览')
    }
    const again = await prepareWorkbenchSkill(runtime as unknown as OrcaRuntimeService, {
      ...scope,
      topic
    })
    expect(again.skillPath).toBe(skillPath)
  }
)

it('preserves a locally edited Skill instead of replacing it during launch', async () => {
  const { runtime } = await fixture()
  const input = { ...scope, topic: 'week-planning' as const }
  const { skillPath } = await prepareWorkbenchSkill(runtime as unknown as OrcaRuntimeService, input)
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\nUser change\n`)
  await expect(
    prepareWorkbenchSkill(runtime as unknown as OrcaRuntimeService, input)
  ).rejects.toThrow('本地修改')
  expect(await readFile(skillPath, 'utf8')).toContain('User change')
})

it('uploads and installs through the owning SSH host, never the desktop staging service', async () => {
  const { runtime, uploads, install } = await fixture()
  relay.request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    if (method === 'skills.beginUpload') {
      return uploads.begin(SkillUploadBeginRequestSchema.parse(params))
    }
    if (method === 'skills.uploadChunk') {
      return uploads.append(SkillUploadChunkRequestSchema.parse(params))
    }
    if (method === 'skills.commitUpload') {
      return uploads.commit(SkillUploadCommitRequestSchema.parse(params).uploadId)
    }
    if (method === 'skills.cancelUpload') {
      return uploads.cancel(SkillUploadCommitRequestSchema.parse(params).uploadId)
    }
    if (method === 'skills.installBundle') {
      return install(SkillBundleInstallRequestSchema.parse(params.request))
    }
    throw new Error(method)
  })
  const result = await prepareWorkbenchSkill(runtime as unknown as OrcaRuntimeService, {
    ...scope,
    hostId: 'ssh:server',
    topic: 'metrics-refresh'
  })
  expect(await readFile(result.skillPath, 'utf8')).toContain('指标')
  expect(runtime.beginSkillUpload).not.toHaveBeenCalled()
  expect(runtime.installSharedSkillBundleRequest).not.toHaveBeenCalled()
})
