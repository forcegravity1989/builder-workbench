import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { useAppStore } from '@/store'
import type { TaskPort } from './version-cycle/ports'
import { createTaskPort } from './task-port'

export function nativeTaskPort(): TaskPort {
  return createTaskPort({
    repos: () => useAppStore.getState().repos,
    lookupGitHubWorkItem: (args) => lookupGitHubWorkItemForSource(args),
    viewCodeHubTask: (args) => codehubApi.viewTask(args),
    openTaskPage: (data, options) => useAppStore.getState().openTaskPage(data, options),
    now: () => new Date().toISOString()
  })
}
