import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { parseExecutionHostId } from '../../shared/execution-host/execution-host'
import { parseWslUncPath } from '../../shared/file-access/wsl-paths'
import type { SkillInstallDestination } from '../../shared/skills/installation/skill-install-contract'
import {
  SkillBundleInstallResultSchema,
  type SkillBundleInstallRequest
} from '../../shared/skills/installation/skill-bundle-install-contract'
import {
  SkillUploadBeginResultSchema,
  SKILL_UPLOAD_CHUNK_MAX_BYTES
} from '../../shared/skills/sharing/skill-upload-session-contract'
import type { WorkbenchSkillPrepareRequest } from '../../shared/workbench/skill-assets'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'
import bundle from '../../shared/workbench/skill-package.json'

export async function prepareWorkbenchSkill(
  runtime: OrcaRuntimeService,
  input: z.infer<typeof WorkbenchSkillPrepareRequest>,
  signal?: AbortSignal
): Promise<{ skillPath: string }> {
  const resolved = await createWorkbenchWorkspaceResolver(
    nativeWorkbenchWorkspaceHost(runtime)
  ).resolve(input)
  if (parseExecutionHostId(resolved.target.hostId)?.kind !== 'local') {
    throw new Error('请通过 Orca 共享主机连接项目所在电脑后准备流程 Skill')
  }
  const projectRuntime = runtime.resolveProjectRuntimeForWorktree(input.worktreeId)
  if (projectRuntime?.status === 'repair-required') {
    throw new Error('请先修复项目执行环境，再准备流程 Skill')
  }
  const destination: SkillInstallDestination =
    projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl'
      ? { scope: 'global', executionTarget: { kind: 'wsl', distro: projectRuntime.runtime.distro } }
      : { scope: 'global', executionTarget: { kind: 'host' } }
  const upload = SkillUploadBeginResultSchema.parse(
    await runtime.beginSkillUpload({ package: bundle.package })
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
      await runtime.appendSkillUploadChunk(chunk)
    }
    await runtime.commitSkillUpload(upload.uploadId)
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
      await runtime.installSharedSkillBundleRequest(request, signal)
    )
    const skill = result.skills.find((item) => item.skillId === input.topic)
    if (skill?.conflict) {
      throw new Error(
        `已保留现有「${input.topic}」Skill。请在原生技能管理中核对这个版本并处理安装冲突，再回来重试。`
      )
    }
    if (
      result.status !== 'complete' ||
      !skill?.canonicalPath ||
      !['installed', 'updated', 'unchanged'].includes(skill.status)
    ) {
      throw new Error(
        `流程 Skill 安装未完成（${skill?.failure?.code ?? result.status}）。请在原生技能管理中核对安装后重试。`
      )
    }
    const skillRoot =
      destination.executionTarget?.kind === 'wsl'
        ? (parseWslUncPath(skill.canonicalPath)?.linuxPath ?? skill.canonicalPath)
        : skill.canonicalPath
    return { skillPath: `${skillRoot.replace(/\\/g, '/')}/SKILL.md` }
  } finally {
    await runtime.cancelSkillUpload(upload.uploadId).catch(() => undefined)
  }
}
