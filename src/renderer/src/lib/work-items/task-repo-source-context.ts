import type { Repo } from '../../../../shared/repository/repo-types'
import type { GitLabProjectRef } from '../../../../shared/gitlab/gitlab-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../../shared/work-items/task-source-context'
import {
  getGitRemoteProviderIdentity,
  parseGitHubRemoteUrl,
  projectHostSetupProjectionFromRepos
} from '../../../../shared/project/host-setup/project-host-setup-projection'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../../shared/execution-host/execution-host'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
export function getTaskPageRepoSourceContext(
  repo: Repo | null | undefined,
  provider: 'github' | 'gitlab',
  gitlabProjectRef?: GitLabProjectRef | null
): TaskSourceContext | null {
  if (!repo) {
    return null
  }
  const projection = projectHostSetupProjectionFromRepos([repo])
  const project = projection.projects[0]
  const setup = projection.setups[0]
  const providerIdentity =
    provider === 'github' && project?.providerIdentity?.provider === 'github'
      ? project.providerIdentity
      : provider === 'gitlab' && gitlabProjectRef
        ? buildGitLabProviderIdentity(gitlabProjectRef)
        : null
  const source = normalizeTaskSourceContext({
    provider,
    projectId: setup?.projectId ?? project?.id ?? repo.id,
    hostId: setup?.hostId ?? getRepoExecutionHostId(repo),
    projectHostSetupId: setup?.id,
    repoId: repo.id,
    providerIdentity
  })
  if (!source || provider !== 'github' || !isWorkbenchShell()) {
    return source
  }
  const remote = repo.gitRemoteIdentity
  const primary = getGitRemoteProviderIdentity(repo)
  const upstream = remote?.remoteName === 'upstream' ? primary : null
  const origin =
    remote?.remoteName === 'upstream'
      ? parseGitHubRemoteUrl(remote.originUrl, source.providerIdentity?.provider === 'github')
      : primary
  return {
    ...source,
    hostId: LOCAL_EXECUTION_HOST_ID,
    localTaskAccount: true,
    taskRemoteCandidates: upstream ? { ...(origin ? { origin } : {}), upstream } : undefined,
    providerIdentity:
      repo.issueSourcePreference === 'origin' && remote?.remoteName === 'upstream'
        ? origin
        : (upstream ?? origin ?? source.providerIdentity)
  }
}
export function buildGitLabProviderIdentity(projectRef: GitLabProjectRef) {
  const pathParts = projectRef.path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  const projectName = pathParts.at(-1) ?? null
  const namespace = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : null
  return {
    provider: 'gitlab' as const,
    projectId: projectRef.path,
    namespace,
    project: projectName,
    webUrl: `https://${projectRef.host}/${projectRef.path}`
  }
}
