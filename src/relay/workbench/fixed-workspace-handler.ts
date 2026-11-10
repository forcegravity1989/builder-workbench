import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { RelayDispatcher } from '../dispatcher'
import { buildRelayGitEnv } from '../relay-command-env'
import { fixedWorkspaceRequestForBranch } from '../../shared/workbench/fixed-workspace'
import { materialResult } from '../../main/workbench/version-material-error'
import { WorkspaceScopeError } from '../../main/workbench/workspace-scope-error'
import { ensureFixedBranchTracking } from '../../main/workbench/fixed-workspace-tracking'

const runGitCommand = promisify(execFile)
const Command = z.strictObject({
  repoPath: z.string().min(1),
  branch: z.string().min(1),
  source: z
    .string()
    .regex(/^(?:refs\/(?:heads|remotes|tags)\/[^\0\r\n]+|[a-f0-9]{40}|[a-f0-9]{64})$/),
  expectedHead: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
})

/** Native existing-branch checkout skips new-branch config; keep BW preparation on a narrow route. */
export function registerFixedWorkspaceRelay(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
  dispatcher.onRequest('workbench.fixedWorkspace.ensureTracking', async (params) =>
    materialResult(async () => {
      const { repoPath, remote, branch, expectedHead } = Command.omit({ source: true })
        .extend({ remote: z.string().min(1) })
        .parse(params)
      await ensureFixedBranchTracking(
        (args) =>
          runGitCommand('git', args, {
            cwd: repoPath,
            env: buildRelayGitEnv(),
            timeout: 10000,
            windowsHide: true
          }),
        remote,
        branch,
        expectedHead
      )
      return null
    })
  )
  dispatcher.onRequest('workbench.fixedWorkspace.recordBranchBase', async (params) =>
    materialResult(async () => {
      const { repoPath, branch, source, expectedHead } = Command.parse(params)
      fixedWorkspaceRequestForBranch(branch)
      const git = (args: string[]) =>
        runGitCommand('git', args, {
          cwd: repoPath,
          env: buildRelayGitEnv(),
          timeout: 10000,
          windowsHide: true
        })
      await git(['check-ref-format', '--branch', branch])
      const head = (
        await git(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])
      ).stdout.trim()
      const base = (await git(['rev-parse', '--verify', `${source}^{commit}`])).stdout.trim()
      if (head !== expectedHead || base !== expectedHead) {
        throw new WorkspaceScopeError('branch-source-changed', '固定分支或起点已改变，请核对后重试')
      }
      const key = `branch.${branch}.base`
      try {
        await git(['config', '--local', '--replace-all', key, source])
      } catch (error) {
        console.warn('Fixed workspace: failed to record creation base', error)
        await git(['config', '--local', '--unset-all', key]).catch(() => undefined)
      }
      // Match native new-branch creation: preserve any explicit user value, even false.
      try {
        let unset = false
        try {
          await git(['config', '--get', 'push.autoSetupRemote'])
        } catch (error) {
          if ((error as { code?: unknown }).code !== 1) {
            throw error
          }
          unset = true
        }
        if (unset) {
          await git(['config', '--local', 'push.autoSetupRemote', 'true'])
        }
      } catch (error) {
        console.warn('Fixed workspace: failed to configure first push', error)
      }
      return null
    })
  )
}
