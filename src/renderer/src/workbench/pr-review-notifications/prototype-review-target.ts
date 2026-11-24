import { useAppStore } from '@/store'
import { openFileInBrowserTab } from '@/lib/file-preview'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { refreshWebRuntimeSessionTabsSnapshot } from '@/runtime/web-runtime-session'
import { isWebRuntimeSessionActive } from '@/runtime/web-runtime-session-environment'
import { selectWebRuntimeSessionBrowserWorktree } from '@/runtime/web-runtime-session-workspace-selection'
import { basename } from '@/lib/path'
import type { PrototypeReviewPageRef } from '../../../../shared/workbench/prototype-review-request'

/** The review reference for an HTML document in a worktree, as seen from this client. */
export function prototypeReviewPageFor(
  worktreeId: string,
  filePath: string
): PrototypeReviewPageRef {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  return {
    sourceEnvironmentId: getRuntimeEnvironmentIdForWorktree(state, worktreeId) ?? 'local',
    sourceHostName: worktree?.hostId ?? '当前主机',
    worktreeId,
    documentKey: filePath,
    title: basename(filePath) || filePath
  }
}

async function resolveEnvironmentId(page: PrototypeReviewPageRef): Promise<string> {
  if (!page.sourceRuntimeId) {
    return page.sourceEnvironmentId
  }
  // Why: a note reaching the document's own host names that host by the sender's environment id,
  // which means nothing here; the stable runtime id says it is this machine.
  const local = await callRuntimeRpc<{ runtimeId?: string }>({ kind: 'local' }, 'status.get')
  if (local.runtimeId === page.sourceRuntimeId) {
    return 'local'
  }
  const snapshots = await window.api.runtimeEnvironments.getStatusSnapshots()
  const match = snapshots.find((item) => item.status?.runtimeId === page.sourceRuntimeId)
  return match?.environmentId ?? page.sourceEnvironmentId
}

/** Opens the reviewed document in this client's own preview tab. */
export async function openPrototypeReviewPage(page: PrototypeReviewPageRef): Promise<void> {
  const environmentId = await resolveEnvironmentId(page)
  if (environmentId === 'local') {
    useAppStore.getState().setActiveWorktree(page.worktreeId)
  } else {
    if (!isWebRuntimeSessionActive(environmentId)) {
      throw new Error(`${page.sourceHostName} 当前不可用`)
    }
    await refreshWebRuntimeSessionTabsSnapshot(environmentId, page.worktreeId, {
      acceptCurrentSnapshot: true,
      afterCurrentInFlight: true,
      errorMode: 'throw'
    })
    selectWebRuntimeSessionBrowserWorktree(page.worktreeId, environmentId)
  }
  const plan = openFileInBrowserTab({ filePath: page.documentKey, worktreeId: page.worktreeId })
  if (plan.status === 'unsupported') {
    throw new Error(plan.message)
  }
}
