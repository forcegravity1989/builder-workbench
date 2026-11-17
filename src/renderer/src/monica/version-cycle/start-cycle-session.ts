import type { TuiAgent } from '../../../../shared/tui-agent'
import type { CycleScope } from './ports'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { buildCyclePrompt } from './cycle-prompt'
import { openWorkflowDraft } from '../open-workflow-draft'
import { revealPlanChat } from '../plan-column-resize'

export async function startCycleSession(
  scope: CycleScope,
  worktreeId: string,
  agent: TuiAgent,
  version?: string | null
) {
  assertCurrentCycleWorkspace(scope, worktreeId)
  const prompt = await buildCyclePrompt(scope, worktreeId, version)
  assertCurrentCycleWorkspace(scope, worktreeId)
  revealPlanChat()
  await openWorkflowDraft(agent, worktreeId, prompt)
  assertCurrentCycleWorkspace(scope, worktreeId)
}
