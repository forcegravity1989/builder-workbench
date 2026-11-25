import { translate } from '@/i18n/i18n'
import { openHttpLink, type HttpLinkSourceOwner } from '@/lib/http-link-routing'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import {
  isWorkbenchRepairIssue,
  openWorkbenchTaskItemLink,
  workbenchTaskItemLink
} from '@/workbench/task-item-link-routing'

// Catalog keys keep their original terminal namespace: they are opaque ids with
// shipped translations, and the popover is now shared with native chat.

export type HttpLinkDestination = 'orca' | 'system' | 'task'

export type HttpLinkActionDestinations = {
  primary: HttpLinkDestination
  alternate?: HttpLinkDestination
  additional?: HttpLinkDestination
}

export function httpLinkActionDestinationsForUrl(
  url: string,
  destinations: HttpLinkActionDestinations | undefined
): HttpLinkActionDestinations | undefined {
  return workbenchTaskItemLink(url)
    ? {
        primary: 'task',
        alternate: 'system',
        ...([destinations?.primary, destinations?.alternate].includes('orca')
          ? { additional: 'orca' as const }
          : {})
      }
    : destinations
}

export type HttpLinkAction = {
  task?: boolean
  external?: boolean
  label: string
  run: () => void | Promise<void>
}

export function workbenchRepairLinkAction(
  url: string,
  worktreeId: string
): { repair?: HttpLinkAction } {
  return worktreeId === FLOATING_TERMINAL_WORKTREE_ID && isWorkbenchRepairIssue(url)
    ? {
        repair: {
          task: true,
          label: translate('workbench.improvement.startRepair', 'Start repair'),
          run: () => openWorkbenchTaskItemLink(url, 'repair')
        }
      }
    : {}
}

export function canSourceOwnerOpenInOrca(
  sourceOwner: HttpLinkSourceOwner,
  canOpenOwnedBrowser: boolean
): boolean {
  return (
    sourceOwner.kind === 'local' ||
    ((sourceOwner.kind === 'runtime' || sourceOwner.kind === 'ssh') && canOpenOwnedBrowser)
  )
}

/** Which destinations a clicked link offers, primary first; a remote source that
 *  cannot reach Orca's managed browser offers only the system browser. */
export function httpLinkActionDestinationsFor(
  settings: { openLinksInApp?: boolean } | null | undefined,
  sourceOwner: HttpLinkSourceOwner,
  canOpenOwnedBrowser: boolean
): HttpLinkActionDestinations {
  if (!canSourceOwnerOpenInOrca(sourceOwner, canOpenOwnedBrowser)) {
    return { primary: 'system' }
  }
  return settings?.openLinksInApp === true
    ? { primary: 'orca', alternate: 'system' }
    : { primary: 'system', alternate: 'orca' }
}

export function httpLinkDestinationLabel(destination: HttpLinkDestination): string {
  if (destination === 'task') {
    return translate(
      'auto.components.terminal.pane.TerminalLinkActionPopover.openInTask',
      'Open in Task'
    )
  }
  return destination === 'orca'
    ? translate(
        'auto.components.terminal.pane.TerminalLinkActionPopover.orcaBrowser',
        'Orca Browser'
      )
    : translate(
        'auto.components.terminal.pane.TerminalLinkActionPopover.systemBrowser',
        'System Browser'
      )
}

/** One action per offered destination; surfaces share the labels and the open call. */
export function buildHttpLinkActions(
  destinations: HttpLinkActionDestinations | undefined,
  open: (destination: HttpLinkDestination | undefined) => void | Promise<void>
): { primary: HttpLinkAction; alternate?: HttpLinkAction; additional?: HttpLinkAction } {
  const actionFor = (destination: HttpLinkDestination | undefined): HttpLinkAction => ({
    ...(destination === 'task' ? { task: true } : {}),
    external: destination === 'system',
    label: destination
      ? httpLinkDestinationLabel(destination)
      : translate('auto.components.terminal.pane.TerminalLinkActionPopover.openLink', 'Open link'),
    run: () => open(destination)
  })
  return {
    primary: actionFor(destinations?.primary),
    ...(destinations?.alternate ? { alternate: actionFor(destinations.alternate) } : {}),
    ...(destinations?.additional ? { additional: actionFor(destinations.additional) } : {})
  }
}

export type HttpLinkRoutingPreferenceRequester = (
  url: string
) => boolean | Promise<boolean> | null | undefined

export type RoutedHttpLinkOptions = {
  worktreeId: string
  sourceOwner?: HttpLinkSourceOwner
  modifierHeld?: boolean
  forceDestination?: HttpLinkDestination
  requestOpenLinksInAppPreference?: HttpLinkRoutingPreferenceRequester
}

export function openRoutedHttpLink(url: string, deps: RoutedHttpLinkOptions): void {
  if (
    deps.forceDestination === 'task' ||
    (!deps.forceDestination && !deps.modifierHeld && workbenchTaskItemLink(url))
  ) {
    void openWorkbenchTaskItemLink(url)
    return
  }
  // Why: the clicked link's owner beats the global active runtime for both local and remote routes.
  const sourceOwner = deps.sourceOwner ?? { kind: 'local' }
  if (deps.forceDestination) {
    openHttpLink(url, {
      allowRemoteInApp: true,
      worktreeId: deps.worktreeId,
      forceInApp: deps.forceDestination === 'orca',
      forceSystemBrowser: deps.forceDestination === 'system',
      sourceOwner
    })
    return
  }
  if (deps.modifierHeld) {
    // Why: the modifier states a destination outright, so it also skips the
    // one-time routing prompt; openHttpLink resolves which destination it means.
    openHttpLink(url, {
      allowRemoteInApp: true,
      worktreeId: deps.worktreeId,
      modifierHeld: true,
      sourceOwner
    })
    return
  }

  // Why: remote sources use the persisted routing preference and never prompt the viewing client.
  const preferenceDecision =
    sourceOwner.kind === 'local' ? deps.requestOpenLinksInAppPreference?.(url) : null
  if (preferenceDecision === null || preferenceDecision === undefined) {
    openHttpLink(url, { allowRemoteInApp: true, worktreeId: deps.worktreeId, sourceOwner })
    return
  }

  // Why: the first link click may need an async preference dialog.
  // Suppress the browser's default link handling first, then route after the
  // persisted choice is available.
  void Promise.resolve(preferenceDecision)
    .then((openInOrca) => {
      openHttpLink(url, {
        allowRemoteInApp: true,
        worktreeId: deps.worktreeId,
        forceSystemBrowser: !openInOrca,
        sourceOwner
      })
    })
    .catch(() => {
      openHttpLink(url, {
        allowRemoteInApp: true,
        worktreeId: deps.worktreeId,
        forceSystemBrowser: true,
        sourceOwner
      })
    })
}
