import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { hostStableKey } from '../../../../shared/automation-owner-key'
import { automationHostFilterStableKey } from '../../../../shared/automation-host-filter'
import { translate } from '@/i18n/i18n'
import type { AutomationEditorRequest } from './automation-editor-request'
import type { AutomationEditorActions } from './use-automation-editor-actions'
import type { AutomationsPageListState } from './use-automations-page-list-state'
import type { AutomationsPageLocalState } from './use-automations-page-local-state'
import type { AutomationsPageStoreState } from './use-automations-page-store-state'

export function useAutomationEditorRequest({
  store,
  local,
  list,
  actions
}: {
  store: AutomationsPageStoreState
  local: AutomationsPageLocalState
  list: AutomationsPageListState
  actions: AutomationEditorActions
}): void {
  const consumed = useRef<AutomationEditorRequest | null>(null)
  const request = store.pendingAutomationEditorRequest
  useEffect(() => {
    // A second entry waits until the user saves or closes the current editor.
    if (!request || local.createOpen || consumed.current === request) {
      return
    }
    const consume = (): void => {
      consumed.current = request
      store.consumeAutomationEditorRequest(request)
    }
    if (request.kind === 'create') {
      consume()
      actions.openCreateDialog(undefined, request)
      return
    }
    const key = hostStableKey(request.host)
    if (automationHostFilterStableKey(store.automationHostFilter) !== key) {
      list.hostCatalog.selectHost({ kind: 'host', host: request.host })
      return
    }
    const entry = list.hostCatalog.entries.find((candidate) => candidate.stableKey === key)
    const row = list.hostCatalog.rows.rows.find(
      (candidate) =>
        candidate.catalogRef &&
        hostStableKey(candidate.catalogRef) === key &&
        candidate.automation.id === request.automationId
    )
    const readable =
      entry?.catalogState === 'authoritative' &&
      entry.owner !== null &&
      entry.querySupport === 'scoped'
    if (readable && row) {
      consume()
      void actions.openEditDialog(row)
      return
    }
    // A loading answer is not proof that the record was deleted.
    if (
      list.hostCatalog.resolution.status === 'loading' ||
      (readable && (entry.authorityHealth === 'loading' || entry.authorityHealth === 'refreshing'))
    ) {
      return
    }
    if (readable && !list.hostCatalog.rows.answered && entry.authorityHealth === 'fresh') {
      return
    }
    consume()
    toast.error(
      translate(
        'auto.components.automations.editorRequest.unavailable',
        'Could not open this automation on its host. Refresh or reconnect, then try again.'
      )
    )
  }, [request, store, local.createOpen, list.hostCatalog, actions])
}
