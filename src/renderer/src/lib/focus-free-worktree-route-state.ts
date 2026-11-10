import type { WorktreeOperationRouteState } from './worktree-operation-route'
import {
  selectFolderWorkspaces,
  selectDetectedWorktreesByRepo,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'

// Every key listed, so a new route input cannot be silently dropped from the projection.
type AllRouteStateKeys = {
  [K in keyof Required<WorktreeOperationRouteState>]: WorktreeOperationRouteState[K]
}
const focusFreeRouteStates = new WeakMap<WorktreeOperationRouteState, WorktreeOperationRouteState>()

/** Neither workspace focus nor the Active Server focus can replace a file's catalog owner. Projects only route inputs: spreading the full app state per lookup dominated ownership sweeps. */
export function focusFreeRouteStateOf(
  state: WorktreeOperationRouteState
): WorktreeOperationRouteState {
  let projected = focusFreeRouteStates.get(state)
  if (!projected) {
    const routeState: AllRouteStateKeys = {
      settings: state.settings,
      runtimeEnvironments: state.runtimeEnvironments,
      folderWorkspaces: selectFolderWorkspaces(state),
      projectGroups: state.projectGroups,
      restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey,
      repos: state.repos,
      worktreesByRepo: selectWorktreesByRepo(state),
      detectedWorktreesByRepo: selectDetectedWorktreesByRepo(state),
      runtimeEnvironmentCatalogHydrated: state.runtimeEnvironmentCatalogHydrated,
      removedRuntimeEnvironmentIds: state.removedRuntimeEnvironmentIds,
      activeWorktreeId: null,
      activeWorkspaceExecutionHostId: null
    }
    projected = routeState
    focusFreeRouteStates.set(state, projected)
  }
  return projected
}
