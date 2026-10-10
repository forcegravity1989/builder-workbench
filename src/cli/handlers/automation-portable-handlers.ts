/**
 * `orca automations export|import`: the portable-file commands. Kept apart from
 * AUTOMATION_HANDLERS for the max-lines budget; merged into the same dispatch
 * table at registration.
 */

import { readFile, writeFile } from 'node:fs/promises'
import type { Automation, AutomationCreateInput } from '../../shared/automations-types'
import type { AutomationDestination } from '../../shared/automation-owner-precondition'
import {
  parseAutomationPortable,
  projectAutomationPortable
} from '../../shared/automation-portable-schema'
import type { CommandHandler } from '../dispatch'
import { formatAutomationShow, printResult, type AutomationShowPayload } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveAutomationDestination } from '../automation-destination'
import { RuntimeClientError } from '../runtime-client'
import { getExplicitTarget } from './automations'

// Why: unlike `automations create`, the portable file always carries a timezone,
// so it stays required here; projectId stays omitted — the target flags resolve it.
type AutomationImportParams = Omit<AutomationCreateInput, 'projectId'> & {
  destination?: AutomationDestination
  repo?: string
  workspace?: string
}

export const AUTOMATION_PORTABLE_HANDLERS: Record<string, CommandHandler> = {
  'automations export': async ({ flags, client }) => {
    const result = await client.call<AutomationShowPayload>('automation.show', {
      id: getRequiredStringFlag(flags, 'id')
    })
    const text = `${JSON.stringify(projectAutomationPortable(result.result.automation), null, 2)}\n`
    const file = getOptionalStringFlag(flags, 'file')
    if (file) {
      await writeFile(file, text, 'utf8')
      process.stdout.write(`Exported automation to ${file}\n`)
    } else {
      process.stdout.write(text)
    }
  },
  'automations import': async ({ flags, client, cwd, json }) => {
    const record = parseAutomationPortable(
      await readFile(getRequiredStringFlag(flags, 'file'), 'utf8')
    )
    const target = await getExplicitTarget(flags, cwd, client)
    if (!target.repo && !target.workspace && !target.runContext) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Import needs an explicit target: --repo, --workspace, or project host flags.'
      )
    }
    const existing = await client.call<{ automations: Automation[] }>('automation.list')
    if (existing.result.automations.some((entry) => entry.name === record.name)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `An automation named "${record.name}" already exists; import does not overwrite.`
      )
    }
    // Why: an imported file is configuration someone else wrote; it starts
    // disabled so a reviewed target and enablement stay human decisions.
    const create = {
      name: record.name,
      prompt: record.prompt,
      precheck: record.precheck,
      agentId: record.agentId,
      ...(target.runContext ? { runContext: target.runContext } : {}),
      repo: target.repo,
      workspace: target.workspace,
      workspaceMode: record.workspaceMode,
      baseBranch: record.baseBranch,
      reuseSession: record.reuseSession,
      timezone: record.timezone,
      enabled: false,
      missedRunGraceMinutes: record.missedRunGraceMinutes,
      rrule: record.rrule,
      dtstart: record.dtstart,
      ...(record.onceAt != null ? { onceAt: record.onceAt } : {})
    } satisfies AutomationImportParams
    const destination = await resolveAutomationDestination(client, target)
    const result = await client.call<{ automation: Automation }>('automation.create', {
      ...create,
      ...(destination ? { destination } : {})
    })
    printResult(result, json, formatAutomationShow)
  }
}
