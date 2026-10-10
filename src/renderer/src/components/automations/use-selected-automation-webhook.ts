/**
 * Fetches the selected automation's webhook endpoint the way its history is
 * fetched: keyed by the row and the owner it was listed under, so a re-pairing
 * never attaches one authority's answer to another's row.
 *
 * The answer is authority-level, so the read carries no owner fence — but it is
 * still three-valued, and only an explicit null may render as "no endpoint".
 */

import { useEffect, useMemo, useRef } from 'react'
import type { AutomationAuthorityRef } from '../../../../shared/automation-owner-ref'
import { capturedAutomationOwner, capturedAutomationOwnerKey } from './automation-captured-owner'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationDispatchContext } from './automation-row-action-dispatch'
import { showAutomationWebhookBaseUrl } from './automation-scoped-list-client'

export type SelectedAutomationWebhookOutcome = {
  automationId: string | null
  /** Which listed row was asked; an ID alone cannot name one of two hosts' copies. */
  rowKey: string | null
  /** Which incarnation answered; a re-pairing makes the same row's answer stale. */
  ownerKey: string | null
  /** Undefined = not answered (old host, failed read, or still loading); null = no endpoint. */
  baseUrl: string | null | undefined
}

export function useSelectedAutomationWebhook(input: {
  selected: AutomationListRow | null
  context: AutomationDispatchContext
  onSettled: (outcome: SelectedAutomationWebhookOutcome) => void
}): void {
  const inputRef = useRef(input)
  inputRef.current = input

  const automationId = input.selected?.automation.id ?? null
  const rowKey = input.selected?.key ?? null
  const fetchKey =
    automationId && rowKey
      ? [
          rowKey,
          capturedAutomationOwnerKey(capturedAutomationOwner(input.context.capturedOwners, rowKey))
        ].join('|')
      : ''
  const captured = input.selected
    ? capturedAutomationOwner(input.context.capturedOwners, input.selected.key).owner
    : null
  const authority = captured?.authority ?? input.context.authority
  const rowAuthority = useMemo<AutomationAuthorityRef>(
    () => (authority?.kind === 'runtime' ? authority : { kind: 'desktop' }),
    [authority]
  )

  useEffect(() => {
    const { context, onSettled } = inputRef.current
    if (!automationId || !rowKey) {
      onSettled({ automationId: null, rowKey: null, ownerKey: null, baseUrl: undefined })
      return
    }
    let cancelled = false
    const owner = capturedAutomationOwnerKey(
      capturedAutomationOwner(context.capturedOwners, rowKey)
    )
    // A missing record or an unreachable authority is an unread answer, not a
    // "no endpoint" one; the block simply does not render for it.
    void showAutomationWebhookBaseUrl(rowAuthority, automationId)
      .catch(() => undefined)
      .then((baseUrl) => {
        if (cancelled) {
          return
        }
        onSettled({ automationId, rowKey, ownerKey: owner, baseUrl })
      })
    return () => {
      cancelled = true
    }
  }, [automationId, rowAuthority, rowKey, fetchKey])
}
