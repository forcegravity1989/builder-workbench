import type { AutomationService } from '../automations/service'
import type {
  Automation,
  AutomationCreateInput,
  AutomationRun,
  AutomationUpdateInput,
  AutomationWorkspaceMode
} from '../../shared/automations-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import type { RuntimeStore } from './runtime-store-contract'
import type { AutomationListParams, AutomationListResult } from '../../shared/automation-list-scope'
import type {
  AutomationOwnerPrecondition,
  AutomationDestination
} from '../../shared/automation-owner-precondition'
import { runAutomationNowFenced } from '../automations/refused-manual-run'
import { paginateAutomationRuns } from '../../shared/automation-run-cursor'
import { hasRuntimeAutomationUpdateValue } from './runtime-automation-update-value'
import { assertAutomationRunContextMatchesTarget } from './runtime-automation-run-context'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { isBotsEnabled } from '../../shared/bots-switch'
import { buildAutomationRrule } from '../../shared/automation-schedule-occurrences'

export type RuntimeAutomationCreateInput = Omit<
  AutomationCreateInput,
  'projectId' | 'workspaceId' | 'workspaceMode' | 'timezone'
> & {
  repo?: string
  workspace?: string
  workspaceMode?: AutomationWorkspaceMode
  timezone?: string
  destination?: AutomationDestination
}

export type RuntimeAutomationUpdateInput = Omit<
  AutomationUpdateInput,
  'projectId' | 'workspaceId'
> & {
  repo?: string
  workspace?: string
}

type RuntimeAutomationTargetResolvers = {
  showRepo: (selector: string) => Promise<Repo>
  showManagedWorktree: (selector: string) => Promise<Pick<Worktree, 'id' | 'repoId' | 'path'>>
}

export class RuntimeAutomationController {
  private service: AutomationService | null = null

  constructor(
    private readonly store: RuntimeStore | null,
    private readonly resolvers: RuntimeAutomationTargetResolvers
  ) {}

  setService(service: AutomationService): void {
    this.service = service
  }

  /** Keep runtime-owned automation work ahead of queued external probes. */
  withExternalProbePriority<T>(run: () => T): T {
    const wrap = this.service?.externalProbePriority
    return wrap ? wrap(run) : run()
  }

  list(): Automation[] {
    if (!this.store?.listAutomations) {
      throw new Error('runtime_unavailable')
    }
    return this.store.listAutomations()
  }

  listRuns(automationId?: string): AutomationRun[] {
    if (!this.store?.listAutomationRuns) {
      throw new Error('runtime_unavailable')
    }
    return this.store.listAutomationRuns(automationId)
  }

  listRunsPage(automationId?: string, limit?: number, cursor?: string) {
    if (this.store?.listAutomationRunsPage) {
      return this.store.listAutomationRunsPage(automationId, limit, cursor)
    }
    return paginateAutomationRuns(this.listRuns(automationId), limit, cursor)
  }

  listForScope(params: AutomationListParams = {}): AutomationListResult {
    if (!this.store?.listAutomationsForScope) {
      throw new Error('runtime_unavailable')
    }
    return this.store.listAutomationsForScope(params)
  }

  ownerPrecondition(id: string): AutomationOwnerPrecondition | null {
    return this.store?.automationOwnerPrecondition?.(id) ?? null
  }

  show(id: string): Automation {
    const automation = this.list().find((entry) => entry.id === id)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    return automation
  }

  async create(
    input: RuntimeAutomationCreateInput,
    destination?: AutomationDestination
  ): Promise<Automation> {
    if (!this.store?.createAutomation) {
      throw new Error('runtime_unavailable')
    }
    if (input.bot) {
      const bot = this.store.getBots?.().find((candidate) => candidate.id === input.bot?.botId)
      if (
        !isBotsEnabled(this.store.getSettings()) ||
        this.store.getSettings()?.experimentalStructuredNativeChat !== true ||
        !bot ||
        (bot.agent !== 'claude' && bot.agent !== 'codex')
      ) {
        throw new Error('Select an available Bot with structured Chat on this host.')
      }
      if (
        input.repo ||
        input.workspace ||
        input.precheck ||
        input.runContext ||
        input.sourceContext ||
        input.workspaceMode ||
        input.baseBranch ||
        input.setupDecision ||
        input.reuseSession
      ) {
        throw new Error('A Bot automation uses the Bot Home as its workspace.')
      }
      if (input.bot.runsIn !== 'new' || input.bot.resultsTo !== 'none' || input.bot.chat) {
        throw new Error('This host runs each Bot schedule in a new Chat.')
      }
      if (!/^FREQ=DAILY;BYHOUR=\d{1,2};BYMINUTE=\d{1,2}$/.test(input.rrule)) {
        throw new Error('This host supports daily Bot schedules.')
      }
      const firstRun = new Date(input.dtstart)
      return this.store.createAutomation(
        {
          creationKey: input.creationKey,
          name: input.name,
          prompt: input.prompt,
          agentId: bot.agent,
          bot: input.bot,
          projectId: '',
          workspaceMode: 'existing',
          workspaceId: folderWorkspaceKey(bot.folderWorkspaceId),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          rrule: buildAutomationRrule({
            preset: 'daily',
            hour: firstRun.getHours(),
            minute: firstRun.getMinutes()
          }),
          dtstart: input.dtstart,
          enabled: input.enabled,
          missedRunGraceMinutes: input.missedRunGraceMinutes
        },
        (destination ?? input.destination)
          ? { destination: destination ?? input.destination }
          : undefined
      )
    }
    const target = await this.resolveTarget(input)
    assertAutomationRunContextMatchesTarget(input.runContext, target.repo)
    if (input.reuseSession && target.workspaceMode !== 'existing') {
      throw new Error('Session reuse requires an existing workspace target.')
    }
    return this.store.createAutomation(
      {
        creationKey: input.creationKey,
        name: input.name,
        prompt: input.prompt,
        precheck: input.precheck,
        agentId: input.agentId,
        runContext: input.runContext,
        sourceContext: input.sourceContext,
        projectId: target.projectId,
        workspaceMode: target.workspaceMode,
        workspaceId: target.workspaceId,
        baseBranch: input.baseBranch,
        setupDecision: input.setupDecision,
        reuseSession: input.reuseSession,
        timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        rrule: input.rrule,
        dtstart: input.dtstart,
        enabled: input.enabled,
        missedRunGraceMinutes: input.missedRunGraceMinutes
      },
      (destination ?? input.destination)
        ? { destination: destination ?? input.destination }
        : undefined
    )
  }

  async update(
    id: string,
    updates: RuntimeAutomationUpdateInput,
    options?: { expectedOwner?: AutomationOwnerPrecondition; destination?: AutomationDestination }
  ): Promise<Automation> {
    if (!this.store?.updateAutomation) {
      throw new Error('runtime_unavailable')
    }
    const current = this.show(id)
    if (current.bot) {
      if (
        options?.destination ||
        Object.keys(updates).some(
          (key) => !['name', 'prompt', 'enabled', 'missedRunGraceMinutes'].includes(key)
        )
      ) {
        throw new Error('Manage the Bot schedule on its existing host.')
      }
      return this.store.updateAutomation(id, updates, options)
    }
    const patch: AutomationUpdateInput = {}
    this.copyPatchValues(updates, patch)
    const targetChanged =
      hasRuntimeAutomationUpdateValue(updates, 'repo') ||
      hasRuntimeAutomationUpdateValue(updates, 'workspace') ||
      hasRuntimeAutomationUpdateValue(updates, 'workspaceMode')
    if (targetChanged) {
      const target = await this.resolveTarget(updates, current)
      assertAutomationRunContextMatchesTarget(updates.runContext, target.repo)
      if (patch.reuseSession === true && target.workspaceMode !== 'existing') {
        throw new Error('Session reuse requires an existing workspace target.')
      }
      patch.projectId = target.projectId
      patch.workspaceMode = target.workspaceMode
      patch.workspaceId = target.workspaceId
      if (target.workspaceMode !== 'existing') {
        patch.reuseSession = false
      }
    }
    if (
      !targetChanged &&
      hasRuntimeAutomationUpdateValue(updates, 'runContext') &&
      current.projectId
    ) {
      const repo = await this.resolvers.showRepo(`id:${current.projectId}`)
      assertAutomationRunContextMatchesTarget(updates.runContext, repo)
    }
    if (!targetChanged && patch.reuseSession && current.workspaceMode !== 'existing') {
      throw new Error('Session reuse requires an existing workspace target.')
    }
    return this.store.updateAutomation(id, patch, options)
  }

  delete(
    id: string,
    expectedOwner?: AutomationOwnerPrecondition
  ): { removed: boolean; id: string } {
    if (!this.store?.deleteAutomation) {
      throw new Error('runtime_unavailable')
    }
    this.show(id)
    this.store.deleteAutomation(id, expectedOwner ? { expectedOwner } : undefined)
    return { removed: true, id }
  }

  async runNow(
    id: string,
    expectedOwner?: AutomationOwnerPrecondition,
    oneShotPrompt?: string
  ): Promise<AutomationRun> {
    if (!this.service) {
      throw new Error('runtime_unavailable')
    }
    const service = this.service
    return await runAutomationNowFenced({
      automationId: id,
      service,
      ...(oneShotPrompt ? { oneShotPrompt } : {}),
      fence: () => {
        if (!this.store?.assertAutomationOwnerFence) {
          if (expectedOwner) {
            throw new Error('runtime_unavailable')
          }
          return
        }
        this.store.assertAutomationOwnerFence({
          id,
          expectedOwner,
          operation: 'execute'
        })
      }
    })
  }

  private copyPatchValues(
    updates: RuntimeAutomationUpdateInput,
    patch: AutomationUpdateInput
  ): void {
    const keys = [
      'name',
      'prompt',
      'precheck',
      'agentId',
      'runContext',
      'sourceContext',
      'baseBranch',
      'setupDecision',
      'reuseSession',
      'timezone',
      'rrule',
      'dtstart',
      'enabled',
      'missedRunGraceMinutes'
    ] as const
    for (const key of keys) {
      if (hasRuntimeAutomationUpdateValue(updates, key)) {
        Object.assign(patch, { [key]: updates[key] })
      }
    }
  }

  private async resolveTarget(
    input: {
      repo?: string
      workspace?: string
      workspaceMode?: AutomationWorkspaceMode
      baseBranch?: string | null
    },
    current?: Automation
  ): Promise<{
    projectId: string
    workspaceMode: AutomationWorkspaceMode
    workspaceId?: string | null
    repo: Repo | null
  }> {
    const hasRepo = input.repo !== undefined
    const hasWorkspace = input.workspace !== undefined
    if (
      current?.workspaceMode === 'existing' &&
      hasRepo &&
      !hasWorkspace &&
      input.workspaceMode !== 'new_per_run'
    ) {
      throw new Error(
        'Repo updates for existing-workspace automation require workspaceMode new_per_run.'
      )
    }
    const workspace = input.workspace
      ? await this.resolvers.showManagedWorktree(input.workspace)
      : null
    const repoSelector =
      input.repo ??
      (workspace?.repoId
        ? `id:${workspace.repoId}`
        : current?.projectId
          ? `id:${current.projectId}`
          : null)
    const repo = repoSelector ? await this.resolvers.showRepo(repoSelector) : null
    const workspaceMode =
      input.workspaceMode ??
      (workspace
        ? 'existing'
        : input.repo && !current
          ? 'new_per_run'
          : (current?.workspaceMode ?? 'new_per_run'))
    if (workspaceMode === 'existing') {
      const workspaceId = workspace?.id ?? current?.workspaceId
      const projectId = workspace?.repoId ?? current?.projectId
      if (repo && repo.id !== projectId) {
        throw new Error('Selected workspace belongs to a different repo.')
      }
      if (!workspaceId || !projectId) {
        throw new Error('Existing-workspace automation requires --workspace.')
      }
      return { projectId, workspaceMode, workspaceId, repo }
    }
    const projectId = repo?.id ?? workspace?.repoId ?? current?.projectId
    if (!projectId) {
      throw new Error('Automation requires --repo or --workspace.')
    }
    return { projectId, workspaceMode: 'new_per_run', workspaceId: null, repo }
  }
}
