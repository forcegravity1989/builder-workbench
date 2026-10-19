import { useAppStore } from '@/store'
import { openHttpLink, type HttpLinkSourceOwner } from '@/lib/http-link-routing'
import { resolveMarkdownLinkTarget } from '@/components/editor/markdown-internal-links'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { assertCurrentCycleWorkspace } from '../version-cycle/current-cycle-workspace'
import { revealPlanChat } from '../plan-column-resize'

/** Material paths belong to the selected workflow tree, never the viewing client's cwd. */
export async function openAcceptanceMaterial(
  location: string,
  context: Pick<VersionCycleContext, 'scope' | 'worktreeId'>
): Promise<void> {
  const { scope, worktreeId } = context
  if (!scope || !worktreeId) {
    throw new Error('验收工作区尚未就绪，请重新打开验收后重试。')
  }
  assertCurrentCycleWorkspace(scope, worktreeId)
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId, scope.hostId)
  const host = parseExecutionHostId(scope.hostId)
  if (!worktree || !host) {
    throw new Error('无法确定材料所属工作树，请核对原生工作区登记。')
  }
  const sourceOwner: HttpLinkSourceOwner = scope.runtimeOwnerEnvironmentId
    ? { kind: 'runtime', runtimeEnvironmentId: scope.runtimeOwnerEnvironmentId }
    : host.kind === 'ssh'
      ? { kind: 'ssh', connectionId: host.targetId }
      : host.kind === 'runtime'
        ? { kind: 'runtime', runtimeEnvironmentId: host.environmentId }
        : { kind: 'local' }
  const sourceFilePath = `${worktree.path.replace(/[\\/]+$/, '')}/README.md`
  const target = resolveMarkdownLinkTarget(location.trim(), sourceFilePath, worktree.path)
  if (!target || target.kind === 'anchor') {
    throw new Error('材料位置无法解析，请提供 HTTP(S) 链接或工作树内的文件路径。')
  }
  if (target.kind === 'external') {
    const url = new URL(target.url)
    if (url.username || url.password) {
      throw new Error('材料链接不应包含账号凭据。')
    }
    openHttpLink(url.href, {
      worktreeId,
      sourceOwner,
      forceInApp: true,
      allowRemoteInApp: true
    })
    revealPlanChat()
    return
  }
  if (sourceOwner.kind !== 'local' && target.relativePath === undefined) {
    throw new Error('材料不在当前远端工作树内，请提供该工作树内的文件路径。')
  }
  await state.activateMarkdownLink(location.trim(), {
    sourceFilePath,
    worktreeId,
    worktreeRoot: worktree.path,
    runtimeEnvironmentId: scope.runtimeOwnerEnvironmentId ?? null,
    sourceOwner
  })
  revealPlanChat()
}
