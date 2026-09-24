import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import { CODEHUB_REQUEST_SCHEMAS, type CodeHubRepoArgs } from '../../shared/codehub-api'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { createCodeHubService } from '../codehub/service'

export function registerCodeHubHandlers(store: Store): void {
  const service = createCodeHubService({
    resolveRepo(args: CodeHubRepoArgs) {
      const repo = args.repoId
        ? store.getRepo(args.repoId)
        : store.getRepos().find((candidate) => resolve(candidate.path) === resolve(args.repoPath))
      if (!repo) {
        throw new Error('Repository is not registered')
      }
      return repo
    },
    localGitOptions: (repo) => getLocalProjectWorktreeGitOptions(store, repo)
  })
  for (const name of Object.keys(CODEHUB_REQUEST_SCHEMAS) as (keyof typeof service)[]) {
    ipcMain.handle(`codehub:${name}`, (_event, args: unknown) => {
      const parsed = CODEHUB_REQUEST_SCHEMAS[name].parse(args)
      const run = service[name] as (input: typeof parsed) => Promise<unknown>
      return run(parsed)
    })
  }
}
