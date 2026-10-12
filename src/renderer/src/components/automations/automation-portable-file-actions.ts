/**
 * Portable-file actions for the automations page: row-menu export and toolbar
 * import. Export reuses the download save dialog (zero new IPC); import picks
 * a file through one small IPC, validates it with the shared parser, and seeds
 * the native editor — machine-bound choices (host, project, workspace) stay
 * empty for a human to pick.
 */

import { toast } from 'sonner'
import {
  parseAutomationPortable,
  projectAutomationPortable,
  type AutomationPortableRecord
} from '../../../../shared/automation-portable-schema'
import { tryParseAutomationRrule } from '../../../../shared/automation-schedule-parsing'
import { isOneShotAutomation } from '../../../../shared/automation-schedule-kind'
import { translate } from '@/i18n/i18n'
import type { AutomationEditorRequest } from './automation-editor-request'
import { AUTOMATION_DEFAULT_TIME, formatTimeInput } from './automation-draft-model'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationTemplate } from './automation-templates'

type CreateEditorRequest = Extract<AutomationEditorRequest, { kind: 'create' }>

/**
 * 编辑器只认 hourly/daily/weekdays/weekly/custom；every_n 与未识别的合法调度走
 * custom 原文——保存透传 customSchedule，往返不撒谎。onceAt 不在此处：编辑器
 * 无法表达一次性时刻，导入动作在打开编辑器前就指名拒绝。
 */
export function buildAutomationImportRequest(
  record: AutomationPortableRecord
): CreateEditorRequest {
  const schedule = tryParseAutomationRrule(record.rrule)
  const preset =
    schedule?.preset === 'hourly' ||
    schedule?.preset === 'daily' ||
    schedule?.preset === 'weekdays' ||
    schedule?.preset === 'weekly'
      ? schedule.preset
      : 'custom'
  return {
    kind: 'create',
    draft: {
      name: record.name,
      prompt: record.prompt,
      projectId: '',
      workspaceId: '',
      agentId: record.agentId,
      workspaceMode: record.workspaceMode,
      baseBranch: record.baseBranch ?? '',
      reuseSession: record.workspaceMode === 'existing' && record.reuseSession,
      precheckCommand: record.precheck?.command ?? '',
      precheckTimeoutSeconds: String(record.precheck?.timeoutSeconds ?? 60),
      preset,
      time: schedule ? formatTimeInput(schedule.hour, schedule.minute) : AUTOMATION_DEFAULT_TIME,
      dayOfWeek: String(schedule?.dayOfWeek ?? 1),
      customSchedule: preset === 'custom' ? record.rrule : '',
      missedRunGraceMinutes: String(record.missedRunGraceMinutes),
      savedSchedule: null,
      scheduleWarning: null
    }
  }
}

export function createAutomationPortableFileActions({
  openCreateDialog
}: {
  openCreateDialog: (template?: AutomationTemplate, request?: CreateEditorRequest) => void
}): {
  exportAutomation: (row: AutomationListRow) => Promise<void>
  importAutomation: () => Promise<void>
} {
  return {
    exportAutomation: async (row: AutomationListRow): Promise<void> => {
      try {
        const record = projectAutomationPortable(row.automation)
        const saved = await window.api.fs.saveDownloadedFile({
          suggestedName: `automation-${row.automation.name
            .replace(/[/\\:*?"<>|]/g, '_')
            .slice(0, 80)}.json`,
          content: `${JSON.stringify(record, null, 2)}\n`,
          encoding: 'utf8'
        })
        if (!saved.canceled) {
          toast.success(
            translate(
              'auto.components.automations.AutomationsPage.exported',
              'Automation exported.'
            )
          )
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    },
    importAutomation: async (): Promise<void> => {
      let picked: { canceled: true } | { canceled: false; content: string }
      try {
        picked = await window.api.automations.pickImportFile()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return
      }
      if (picked.canceled) {
        return
      }
      let record: AutomationPortableRecord
      try {
        record = parseAutomationPortable(picked.content)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return
      }
      if (isOneShotAutomation(record)) {
        toast.error(
          translate(
            'auto.components.automations.AutomationsPage.importOneShotUnsupported',
            'One-shot automations cannot be filled into the visual editor yet. Import this file with the CLI: orca automations import <file> --repo <selector>'
          )
        )
        return
      }
      openCreateDialog(undefined, buildAutomationImportRequest(record))
    }
  }
}
