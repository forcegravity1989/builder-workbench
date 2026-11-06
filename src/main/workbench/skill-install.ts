import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { parseExecutionHostId } from '../../shared/execution-host'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { SkillInstallDestination } from '../../shared/skill-install-contract'
import {
  SkillBundleInstallResultSchema,
  type SkillBundleInstallRequest
} from '../../shared/skill-bundle-install-contract'
import {
  SkillUploadBeginResultSchema,
  SKILL_UPLOAD_CHUNK_MAX_BYTES
} from '../../shared/skill-upload-session-contract'
import type { WorkbenchSkillPrepareRequest } from '../../shared/workbench/skill-assets'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import bundle from '../../shared/workbench/skill-package.json'

export async function prepareWorkbenchSkill(
  runtime: OrcaRuntimeService,
  input: z.infer<typeof WorkbenchSkillPrepareRequest>,
  signal?: AbortSignal
): Promise<{ skillPath: string }> {
  const resolved = await createWorkbenchWorkspaceResolver(
    nativeWorkbenchWorkspaceHost(runtime)
  ).resolve(input)
  const host = parseExecutionHostId(resolved.target.hostId)
  const ssh = host?.kind === 'ssh' ? getActiveMultiplexer(host.targetId) : null
  if (host?.kind === 'ssh' && !ssh) {
    throw new Error('工作树所属 SSH 宿主未连接')
  }
  const projectRuntime = ssh
    ? undefined
    : runtime.resolveProjectRuntimeForWorktree(input.worktreeId)
  if (projectRuntime?.status === 'repair-required') {
    throw new Error('请先修复项目执行环境，再准备流程 Skill')
  }
  const destination: SkillInstallDestination =
    projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl'
      ? { scope: 'global', executionTarget: { kind: 'wsl', distro: projectRuntime.runtime.distro } }
      : { scope: 'global', executionTarget: { kind: 'host' } }
  const upload = SkillUploadBeginResultSchema.parse(
    ssh
      ? await ssh.request('skills.beginUpload', { package: bundle.package })
      : await runtime.beginSkillUpload({ package: bundle.package })
  )
  try {
    const bytes = Buffer.from(bundle.archiveBase64, 'base64')
    const chunkBytes = Math.min(upload.chunkBytes, SKILL_UPLOAD_CHUNK_MAX_BYTES)
    if (upload.acknowledgedOffset > bytes.length) {
      throw new Error('技能包上传偏移无效')
    }
    for (let offset = upload.acknowledgedOffset; offset < bytes.length; offset += chunkBytes) {
      signal?.throwIfAborted()
      const chunk = {
        uploadId: upload.uploadId,
        offset,
        bytesBase64: bytes.subarray(offset, offset + chunkBytes).toString('base64')
      }
      await (ssh ? ssh.request('skills.uploadChunk', chunk) : runtime.appendSkillUploadChunk(chunk))
    }
    await (ssh
      ? ssh.request('skills.commitUpload', { uploadId: upload.uploadId })
      : runtime.commitSkillUpload(upload.uploadId))
    await resolved.reauthorize()
    signal?.throwIfAborted()
    const request: SkillBundleInstallRequest = {
      operationId: randomUUID(),
      package: bundle.package,
      selectedSkillIds: [input.topic],
      ingress: { kind: 'staged-upload', uploadId: upload.uploadId },
      destination,
      providers: [],
      conflictDecisions: [{ skillId: input.topic, resolution: 'replace-unmodified' }]
    }
    const result = SkillBundleInstallResultSchema.parse(
      ssh
        ? await ssh.request('skills.installBundle', { request }, { signal, timeoutMs: 120_000 })
        : await runtime.installSharedSkillBundleRequest(request, signal)
    )
    const skill = result.skills.find((item) => item.skillId === input.topic)
    if (
      result.status !== 'complete' ||
      !skill?.canonicalPath ||
      !['installed', 'updated', 'unchanged'].includes(skill.status)
    ) {
      throw new Error(
        `流程 Skill 未就绪，请在原生技能管理中核对安装或本地修改：${skill?.failure?.code ?? result.status}`
      )
    }
    const skillRoot =
      destination.executionTarget?.kind === 'wsl'
        ? (parseWslUncPath(skill.canonicalPath)?.linuxPath ?? skill.canonicalPath)
        : skill.canonicalPath
    return { skillPath: `${skillRoot.replace(/\\/g, '/')}/SKILL.md` }
  } finally {
    await (
      ssh
        ? ssh.request('skills.cancelUpload', { uploadId: upload.uploadId })
        : runtime.cancelSkillUpload(upload.uploadId)
    ).catch(() => undefined)
  }
}
