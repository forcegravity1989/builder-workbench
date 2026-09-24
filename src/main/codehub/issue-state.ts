import type { GitHubIssueCloseReason } from '../../shared/issue-mutation-types'
import { codeHubIssueCloseComment } from '../../shared/codehub'
import { runCodeHubCli } from './cli'

function isAlreadyStateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('already')
}

async function runStateCommand(args: string[]): Promise<void> {
  try {
    await runCodeHubCli(args)
  } catch (error) {
    if (isAlreadyStateError(error)) {
      return
    }
    throw error
  }
}

export async function applyCodeHubIssueState(input: {
  host: string
  project: string
  issueNumber: number
  state: 'open' | 'closed'
  stateReason?: GitHubIssueCloseReason | null
  duplicateOf?: number | null
}): Promise<void> {
  const iid = String(input.issueNumber)
  const scope = ['-p', input.project, '-H', input.host]
  if (input.state === 'open') {
    await runStateCommand(['issue', 'reopen', iid, ...scope])
    return
  }
  await runCodeHubCli([
    'issue',
    'comment',
    'create',
    iid,
    ...scope,
    '--body',
    codeHubIssueCloseComment(input.stateReason, input.duplicateOf)
  ])
  await runStateCommand(['issue', 'close', iid, ...scope])
}
