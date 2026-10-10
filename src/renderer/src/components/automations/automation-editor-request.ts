import type { StableAutomationHostRef } from '../../../../shared/automation-owner-ref'
import type { AutomationDraft } from './AutomationEditorDialog'

/** Opens the native editor only; no automation is saved or run by this request. */
export type AutomationEditorRequest =
  | {
      kind: 'create'
      /** Absent = 不钉创建宿主，留给人选（导入预填：机器绑定字段不随文件走）。 */
      host?: StableAutomationHostRef
      draft: Pick<AutomationDraft, 'name' | 'prompt' | 'projectId' | 'workspaceId'> &
        Partial<
          Pick<
            AutomationDraft,
            | 'agentId'
            | 'workspaceMode'
            | 'reuseSession'
            | 'preset'
            | 'time'
            | 'dayOfWeek'
            | 'customSchedule'
            | 'creationKey'
            | 'precheckCommand'
            | 'precheckTimeoutSeconds'
            | 'baseBranch'
            | 'missedRunGraceMinutes'
            | 'savedSchedule'
            | 'scheduleWarning'
          >
        >
    }
  | { kind: 'edit'; host: StableAutomationHostRef; automationId: string }
