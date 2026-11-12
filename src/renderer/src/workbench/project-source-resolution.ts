import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import {
  getProjectIdentityKey,
  isHostLocalProjectId
} from '../../../shared/project-host-setup-projection'
import type { Repo } from '../../../shared/repo-types'

/**
 * 项目级入口点击时写入的「主机 + 项目」来源对。全局只保留这一份当前项目
 * 状态；入口在点击时现算，不继承上一个工作树留下的来源。
 */
export type ProjectSourcePair = {
  repoId: string
  hostId: ExecutionHostId
}

/**
 * local-first：本机登记优先；本机没有该远端项目时才降级到其他主机。
 * local-only：只有本机登记可用；本机没有时返回 null，由调用方如实提示，
 * 不把远端路径当成本机能力使用。
 */
export type ProjectSourcePolicy = 'local-first' | 'local-only'

type RuntimeEnvironmentHint = {
  id: string
  createdAt?: number | null
}

/**
 * 解析这次点击应该使用的来源。匹配只按远端项目身份进行，不按显示名或路径，
 * 避免把另一个项目当成同项目的另一台机器。
 */
export function resolveProjectSourcePair(
  repos: readonly Repo[],
  currentRepoId: string | null | undefined,
  policy: ProjectSourcePolicy,
  options?: { runtimeEnvironments?: readonly RuntimeEnvironmentHint[] }
): ProjectSourcePair | null {
  const current =
    repos.find((repo) => repo.id === currentRepoId) ?? (currentRepoId ? null : (repos[0] ?? null))
  if (!current) {
    return null
  }
  const sameProject = sameProjectRows(repos, current)
  const local = sameProject.filter(
    (repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  )
  const localRow = [...local].sort(compareRepoRows)[0] ?? null
  if (localRow) {
    return toPair(localRow)
  }
  if (policy === 'local-only') {
    return null
  }
  const fallback = [...sameProject].sort((a, b) =>
    compareFallbackRows(a, b, options?.runtimeEnvironments)
  )[0]
  return fallback ? toPair(fallback) : null
}

/** 同一远端项目在同一批登记里可能有多行；无远端身份的本地项目只匹配自身。 */
export function sameProjectRows(repos: readonly Repo[], base: Repo): Repo[] {
  const identity = getProjectIdentityKey(base)
  if (isHostLocalProjectId(identity)) {
    return [base]
  }
  return repos.filter((repo) => getProjectIdentityKey(repo) === identity)
}

function toPair(repo: Repo): ProjectSourcePair {
  return { repoId: repo.id, hostId: getRepoExecutionHostId(repo) }
}

function compareRepoRows(a: Repo, b: Repo): number {
  return (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.id.localeCompare(b.id)
}

/**
 * 降级顺序按主机最早连接时间：运行环境取配对时间，其余主机取登记行时间。
 * 时间相同再按登记顺序与 id，保证同一批数据得到同一个结果。
 */
function compareFallbackRows(
  a: Repo,
  b: Repo,
  environments: readonly RuntimeEnvironmentHint[] | undefined
): number {
  const connectA = hostConnectedAt(a, environments)
  const connectB = hostConnectedAt(b, environments)
  return connectA - connectB || compareRepoRows(a, b)
}

function hostConnectedAt(
  repo: Repo,
  environments: readonly RuntimeEnvironmentHint[] | undefined
): number {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (host?.kind === 'runtime' && environments) {
    const environment = environments.find((candidate) => candidate.id === host.environmentId)
    if (environment?.createdAt) {
      return environment.createdAt
    }
  }
  return repo.addedAt ?? Number.MAX_SAFE_INTEGER
}
