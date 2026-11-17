import type { Project } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import {
  getLocalProjectWorktreeGitOptionsForRuntime,
  resolveLocalProjectRuntimeForRepo
} from '../project-runtime-git-options'
import { parseWslPath } from '../wsl'
import type { MonicaWorkspaceRepo } from './workspace-resolver'

export type MonicaGitRoutingRuntime = {
  listProjects(): Project[]
}

/**
 * WSL routing for Monica host adapters, as close to the native project-runtime
 * resolution as the public runtime surface allows:
 * - a repo on the WSL filesystem names its own distro (authoritative);
 * - otherwise the project's registered runtime preference decides, resolved
 *   through the native resolver with the WSL availability caches.
 * Known gap: the global windows-runtime default lives in settings, which RPC
 * handlers cannot read, so an inherit-global project on a Windows-drive repo
 * runs host Git — the same deliberate fallback the native worktree-create
 * prefetch takes for unresolved runtimes. Repair-required runtimes also fall
 * back for these read-only operations instead of blocking history/metrics.
 */
export function resolveMonicaGitExecOptions(
  runtime: MonicaGitRoutingRuntime,
  repo: MonicaWorkspaceRepo
): { wslDistro?: string } {
  const pathDistro = parseWslPath(repo.path)?.distro
  if (pathDistro) {
    return { wslDistro: pathDistro }
  }
  const resolution = resolveLocalProjectRuntimeForRepo(
    { getProjects: () => runtime.listProjects(), getSettings: () => ({}) },
    repo as Repo
  )
  if (!resolution || resolution.status !== 'resolved') {
    return {}
  }
  return getLocalProjectWorktreeGitOptionsForRuntime(repo as Repo, resolution)
}
