import React from 'react'
import { ServerOff } from 'lucide-react'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import NoticeHostGlyph from '@/components/sidebar/NoticeHostGlyph'
import {
  isDisconnectedRuntimeHostState,
  runtimeHostConnectionStateForEntry
} from '@/runtime/runtime-host-connection-state'
import { parseExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { closeProjectPage } from './project-page-state'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'

type VersionHostOwner = {
  repoId?: string
  hostId?: string | null
  runtimeOwnerEnvironmentId?: string | null
}

function runtimeOwnerId(owner: VersionHostOwner, repoHostId?: string | null): string | null {
  const host = parseExecutionHostId(owner.hostId)
  const repoHost = parseExecutionHostId(repoHostId)
  return (
    owner.runtimeOwnerEnvironmentId ??
    (host?.kind === 'runtime' ? host.environmentId : null) ??
    (repoHost?.kind === 'runtime' ? repoHost.environmentId : null)
  )
}

export function isVersionHostDisconnected(owner: VersionHostOwner): boolean {
  const state = useAppStore.getState()
  const environmentId = runtimeOwnerId(
    owner,
    state.repos.find((repo) => repo.id === owner.repoId)?.executionHostId
  )
  return (
    !!environmentId &&
    isDisconnectedRuntimeHostState(
      runtimeHostConnectionStateForEntry(state.runtimeStatusByEnvironmentId.get(environmentId))
    )
  )
}

/** 只有原生已证实断链时保持当前工作区；未知状态仍交给原生激活与恢复链。 */
export function activateVersionWorktree(tree: Worktree): boolean {
  if (isVersionHostDisconnected(tree)) {
    return false
  }
  const result = activateAndRevealWorktree(tree.id, worktreeActivationHostOpts(tree))
  if (result !== false) {
    closeProjectPage()
  }
  return result !== false
}

export function VersionWorktreeHostGlyph({ tree }: { tree: Worktree }): React.JSX.Element | null {
  const owner = useAppStore((state) =>
    runtimeOwnerId(tree, state.repos.find((repo) => repo.id === tree.repoId)?.executionHostId)
  )
  const host = parseExecutionHostId(owner ? toRuntimeExecutionHostId(owner) : tree.hostId)
  const label = useAppStore((state) =>
    host?.kind === 'runtime'
      ? state.runtimeEnvironments.find((environment) => environment.id === host.environmentId)?.name
      : null
  )
  const disconnected = useAppStore(
    (state) =>
      !!owner &&
      isDisconnectedRuntimeHostState(
        runtimeHostConnectionStateForEntry(state.runtimeStatusByEnvironmentId.get(owner))
      )
  )
  if (!host || host.kind === 'local') {
    return null
  }
  if (disconnected) {
    return (
      <ServerOff
        className="size-3 shrink-0 text-destructive"
        aria-label={`${label ?? host.id} disconnected`}
      />
    )
  }
  return <NoticeHostGlyph hostId={host.id} hostLabel={label ?? host.id} keyboardFocusable={false} />
}
