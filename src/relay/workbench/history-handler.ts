import { z } from 'zod'
import type { RelayDispatcher } from '../dispatcher'
import { runReadOnlyHistoryGit } from '../../main/workbench/history-git-core'
import { runTrunkBaseline } from '../../main/workbench/trunk-baseline'
import { HistorySourceError } from '../../main/workbench/version-history-snapshot'

const Command = z.strictObject({
  target: z.strictObject({ repoPath: z.string().min(1) }),
  operation: z.enum(['git', 'baseline']),
  args: z.array(z.string().min(1)).optional(),
  // Wire name predates the trunk-baseline unification; carries the pinned
  // worktreeBaseRef and stays so older peers keep parsing the request.
  adoptedRef: z.string().min(1).nullish()
})

/**
 * Narrow SSH executor for BW version history: the same shared core the local
 * host runs, mounted on Orca's authenticated relay after runtime inventory
 * resolved the repo path. Only allowlisted read-only Git argv and the adopted
 * baseline resolution cross this channel — provider.exec stays unextended.
 */
export function registerVersionHistoryRelay(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
  dispatcher.onRequest('workbench.history.execute', async (params) => {
    const { target, operation, args, adoptedRef } = Command.parse(params)
    try {
      if (operation === 'git') {
        const outcome = await runReadOnlyHistoryGit(target.repoPath, args ?? [])
        if (!outcome.ok) {
          return {
            ok: false,
            error: { code: outcome.code, message: outcome.message, exitCode: outcome.exitCode }
          }
        }
        return { ok: true, value: { stdout: outcome.stdout.toString('base64') } }
      }
      const baseline = await runTrunkBaseline(target.repoPath, adoptedRef ?? null)
      return { ok: true, value: baseline }
    } catch (error) {
      if (error instanceof HistorySourceError) {
        return { ok: false, error: { code: error.code, message: error.message } }
      }
      return {
        ok: false,
        error: {
          code: 'history-failed',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  })
}
