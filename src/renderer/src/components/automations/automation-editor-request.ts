import type { StableAutomationHostRef } from '../../../../shared/automations/ownership/automation-owner-ref'
import type { AutomationDraft } from './authoring/AutomationEditorDialog'

/** Opens the native editor only; no automation is saved or run by this request. */
export type AutomationEditorRequest =
  | {
      kind: 'create'
      host: StableAutomationHostRef
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
          >
        >
    }
  | { kind: 'edit'; host: StableAutomationHostRef; automationId: string }
