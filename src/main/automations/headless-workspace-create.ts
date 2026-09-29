import type { Automation, AutomationRun } from '../../shared/automations-types'
import { buildAutomationWorkspaceProvenance } from '../../shared/automation-workspace-provenance'
import { combineAutomationRunPrompt } from '../../shared/automation-run-prompt'
import type { Repo } from '../../shared/repo-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type HeadlessAutomationRunForWorkspace = Pick<AutomationRun, 'id' | 'title' | 'scheduledFor'>
type RuntimeCreateManagedWorktreeArgs = Parameters<OrcaRuntimeService['createManagedWorktree']>[0]

export function buildHeadlessAutomationWorkspaceName(
  runTitle: string,
  scheduledFor: number
): string {
  // Why: generated workspace names must stay deterministic and short enough for
  // cross-provider branch/path displays while still carrying the run timestamp.
  const slug = runTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const stamp = new Date(scheduledFor).toISOString().replace(/[-:]/g, '').slice(0, 13)
  return `auto-${slug || 'run'}-${stamp}`
}

export function buildHeadlessAutomationWorktreeCreateArgs({
  automation,
  run,
  repo,
  createdAt = Date.now(),
  oneShotPrompt
}: {
  automation: Automation
  run: HeadlessAutomationRunForWorkspace
  repo: Repo
  createdAt?: number
  /** This run's one-shot context; merged into the startup delivery only, provenance keeps the record identity. */
  oneShotPrompt?: string
}): RuntimeCreateManagedWorktreeArgs {
  return {
    repoSelector: repo.id,
    name: buildHeadlessAutomationWorkspaceName(run.title, run.scheduledFor),
    baseBranch: automation.baseBranch ?? undefined,
    setupDecision: automation.setupDecision ?? 'skip',
    activate: false,
    createdWithAgent: automation.agentId,
    startupAgent: automation.agentId,
    startupPrompt: combineAutomationRunPrompt(automation.prompt, oneShotPrompt),
    telemetrySource: 'unknown',
    automationProvenance: buildAutomationWorkspaceProvenance(automation, run, repo, createdAt)
  }
}
