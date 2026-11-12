import { localCodehubApi } from '@/lib/codehub-api'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import {
  getProjectIdentityKey,
  getProjectProviderIdentity
} from '../../../shared/project-host-setup-projection'
import type { GitHubRepositoryIdentity } from '../../../shared/github/pull-request-types'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { Repo } from '../../../shared/repo-types'
import { useAppStore } from '@/store'
import type { TaskPort } from './version-cycle/ports'
import { createTaskPort, type TaskPortDeps } from './task-port'
import { createTaskReferenceReader } from './task-reference-reader'

/** 同远端项目有多行登记时，任务读取只用本机那一行；远端行只提供身份。 */
function localRowForTaskRead(repos: readonly Repo[], repoId: string): Repo | null {
  const row = repos.find((candidate) => candidate.id === repoId)
  if (!row) {
    return null
  }
  if (getRepoExecutionHostId(row) === LOCAL_EXECUTION_HOST_ID) {
    return row
  }
  const identity = getProjectIdentityKey(row)
  return (
    repos.find(
      (candidate) =>
        candidate.id !== row.id &&
        getRepoExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID &&
        getProjectIdentityKey(candidate) === identity
    ) ?? null
  )
}

/** 任务数据固定本机读取，项目身份来自远端登记行，执行和权限用本机。 */
async function lookupGitHubWorkItemLocally(args: {
  repoId: string
  number: number
  issueSource?: GitHubRepositoryIdentity
}): Promise<Omit<GitHubWorkItem, 'repoId'> | null> {
  const repos = useAppStore.getState().repos
  const local = localRowForTaskRead(repos, args.repoId)
  if (local) {
    return args.issueSource
      ? window.api.gh.workItemByOwnerRepo({
          repoPath: local.path,
          repoId: local.id,
          ...args.issueSource,
          number: args.number,
          type: 'issue'
        })
      : window.api.gh.workItem({
          repoPath: local.path,
          repoId: local.id,
          number: args.number
        })
  }
  // 本机没有该项目检出时按远端身份读：gh 只认 owner/repo 与本机登录态。
  const remoteRow = repos.find((candidate) => candidate.id === args.repoId)
  const identity = args.issueSource ?? (remoteRow ? getProjectProviderIdentity(remoteRow) : null)
  if (!identity) {
    throw new Error('无法解析 GitHub 远端项目身份')
  }
  const result = await window.api.gh.workItemsBatch({
    ...(identity.host ? { host: identity.host } : {}),
    owner: identity.owner,
    repo: identity.repo,
    numbers: [args.number]
  })
  if (result.error) {
    throw new Error(result.error)
  }
  return result.items.find((item) => item.number === args.number) ?? null
}

/** 原生读写依赖单实现：TaskPort 装配与点读消费方（补绑定 Issue 用途）共用同一 wiring。 */
export function nativeTaskPortDeps(): TaskPortDeps {
  return {
    repos: () => useAppStore.getState().repos,
    lookupGitHubWorkItem: ({ repoId, number, issueSource }) =>
      lookupGitHubWorkItemLocally({ repoId, number, issueSource }),
    lookupGitHubWorkItems: (args) => window.api.gh.workItemsBatch(args),
    viewCodeHubTask: ({ ...args }) => localCodehubApi.viewTask(args),
    openTaskPage: (data, options) => useAppStore.getState().openTaskPage(data, options),
    now: () => new Date().toISOString()
  }
}

const deps = nativeTaskPortDeps()
export const nativeTaskReferenceReader = createTaskReferenceReader(deps)
const port = createTaskPort(deps, nativeTaskReferenceReader)

export function nativeTaskPort(): TaskPort {
  return port
}
