import { randomUUID } from 'node:crypto'
import type { RuntimeFileReadChunkResult, RuntimeWorktreeRecord } from '../../shared/runtime-types'
import type { SshConnectionState } from '../../shared/ssh-types'
import { isRuntimePathAbsolute, relativePathInsideRoot } from '../../shared/cross-platform-path'
import { parseExecutionHostId } from '../../shared/execution-host'
import { isWslUncPath, parseWslUncPath, toWindowsWslPath } from '../../shared/wsl-paths'
import type { HandlerContext } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'

/** Native file RPC keeps SSH/WSL output on the selected workspace's host. */
export async function meetingOutputTarget(ctx: HandlerContext, worktree: string, output: string) {
  if (!isRuntimePathAbsolute(output)) {
    throw new RuntimeClientError('invalid_argument', '--output 必须是所选工作树内的绝对文件路径。')
  }
  const response = await ctx.client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
    worktree
  })
  const target = response.result.worktree
  const distro = parseWslUncPath(ctx.cwd)?.distro
  const path =
    distro &&
    isWslUncPath(target.path) &&
    output.startsWith('/') &&
    !output.startsWith('//') &&
    !output.includes('\\')
      ? toWindowsWslPath(output, distro)
      : output
  const relativePath = relativePathInsideRoot(target.path, path)
  if (!relativePath) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--output 必须指向所选工作树内的文件；不能使用工作树根或其他宿主的路径。'
    )
  }
  const host = parseExecutionHostId(target.hostId)
  if (target.hostId !== undefined && !host) {
    throw new RuntimeClientError('invalid_environment', '工作树宿主无法确认，请刷新工作区后重试。')
  }
  const provenance: Record<string, string | number> = {
    expectedExecutionHostId: host?.id ?? 'local'
  }
  if (host?.kind === 'ssh') {
    const state = (
      await ctx.client.call<{ state: SshConnectionState | null }>('ssh.getState', {
        targetId: host.targetId
      })
    ).result.state
    if (state?.targetId !== host.targetId || state.connectionGeneration === undefined) {
      throw new RuntimeClientError(
        'invalid_environment',
        'SSH 连接身份无法确认，请重新连接后重试。'
      )
    }
    Object.assign(provenance, {
      expectedExecutionHostId: host.id,
      expectedSshTargetId: host.targetId,
      expectedSshConnectionGeneration: state.connectionGeneration
    })
  }
  return { worktree, relativePath, provenance }
}

export async function writeMeetingOutput(
  ctx: HandlerContext,
  target: Awaited<ReturnType<typeof meetingOutputTarget>>,
  document: unknown
): Promise<void> {
  const { worktree, relativePath, provenance } = target
  const temporary = `${relativePath}.partial-${randomUUID()}`
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
  const size = 24_000
  let created = false
  try {
    for (let offset = 0; offset < bytes.length; offset += size) {
      await ctx.client.call('files.writeBase64Chunk', {
        worktree,
        relativePath: temporary,
        ...provenance,
        contentBase64: bytes.subarray(offset, offset + size).toString('base64'),
        append: offset > 0
      })
      created = true
    }
    for (let offset = 0; offset < bytes.length; offset += size) {
      const read = (
        await ctx.client.call<RuntimeFileReadChunkResult>('files.readChunk', {
          worktree,
          relativePath: temporary,
          offset,
          length: size
        })
      ).result
      const expected = bytes.subarray(offset, offset + size)
      if (
        read.bytesRead !== expected.length ||
        !Buffer.from(read.contentBase64, 'base64').equals(expected)
      ) {
        throw new RuntimeClientError(
          'meeting-output-incomplete',
          '宿主读回与转写内容不一致，未发布最终文件。'
        )
      }
    }
    await ctx.client.call('files.rename', {
      worktree,
      oldRelativePath: temporary,
      newRelativePath: relativePath,
      ...provenance
    })
    created = false
  } finally {
    if (created) {
      await ctx.client
        .call('files.delete', { worktree, relativePath: temporary, ...provenance })
        .catch(() => {})
    }
  }
}
