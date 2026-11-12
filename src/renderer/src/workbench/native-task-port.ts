import { createCodeHubApi } from '@/lib/codehub-api'
import {
  lookupGitHubWorkItemByOwnerRepoForSource,
  lookupGitHubWorkItemForSource
} from '@/lib/github-work-item-source-lookup'
import { useAppStore } from '@/store'
import type { TaskPort } from './version-cycle/ports'
import { createTaskPort, type TaskPortDeps } from './task-port'
import { createTaskReferenceReader } from './task-reference-reader'

/** 原生读写依赖单实现：TaskPort 装配与点读消费方（补绑定 Issue 用途）共用同一 wiring。 */
export function nativeTaskPortDeps(): TaskPortDeps {
  return {
    repos: () => useAppStore.getState().repos,
    lookupGitHubWorkItem: ({ issueSource, ...args }) =>
      issueSource
        ? lookupGitHubWorkItemByOwnerRepoForSource({ ...args, ...issueSource, type: 'issue' })
        : lookupGitHubWorkItemForSource(args),
    lookupGitHubWorkItems: (args) => window.api.gh.workItemsBatch(args),
    viewCodeHubTask: ({ sourceContext, ...args }) => createCodeHubApi(sourceContext).viewTask(args),
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
