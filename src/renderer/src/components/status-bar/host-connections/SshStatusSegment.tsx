import React, { useCallback, useMemo, useRef, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useRuntimeStatusByEnvironmentId } from '@/store/slices/runtime-status/views/use-runtime-status-view'
import { useAppStore } from '../../../store/index'
import { translate } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import { getHostDisplayLabelOverrides } from '../../../../../shared/execution-host/host-setting-overrides'
import {
  isOwnedSshTargetId,
  toRuntimeExecutionHostId,
  toSshExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import { buildExecutionHostRegistry } from '../../../../../shared/execution-host/execution-host-registry'
import { pickerExecutionHosts } from '../../../../../shared/execution-host/managed-orcad-execution-host'
import {
  isListedRemoteServer,
  runtimePairingRepairRoute
} from '../../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { RuntimeHostStatusRow } from './RuntimeHostStatusRow'
import { connectedHostCountLabel, moreSshHostsLabel } from './ssh-status-segment-copy'
import { SshHostFindPopover } from './SshHostFindPopover'
import { splitSshStatusMenuRows } from './ssh-status-menu-rows'
import { SshTargetStatusRow } from './SshTargetStatusRow'
import { TeamHostRefreshMenuItem } from '../../../workbench/TeamHostRefreshMenuItem'
import { syncSshConfigTargetsPassively } from '../../../runtime/hosts/ssh/ssh-config-passive-sync'
import { connectRuntimeHostAndReloadProjects } from './runtime-environment-explicit-connect'
import {
  runtimeHostBlockedCopy,
  runtimeHostBlockedRecovery,
  runtimeHostConnectionDetail,
  runtimeHostStatusForOverall,
  sshStatusForOverall
} from './remote-host-connection-status'
import type { RuntimeHostBlockedRecovery } from './remote-host-connection-status'
import { runtimeHostConnectionStateForEntry } from '@/runtime/hosts/connections/runtime-host-connection-state'
import { isConnectedRuntimeHostState } from '../../../../../shared/remote-runtime/host-status/runtime-host-connection-state'
import { RuntimeRepairDialog } from '../../runtime-access/RuntimeRepairDialog'
import type { SshConnectionStatus } from '../../../../../shared/remote-runtime/ssh/ssh-types'

export function SshStatusSegment({
  variant = 'status-bar'
}: { variant?: 'status-bar' | 'rail' } = {}): React.JSX.Element | null {
  const rail = variant === 'rail'
  const t = useTranslate()
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const repos = useAppStore((s) => s.repos)
  const settings = useAppStore((s) => s.settings)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useRuntimeStatusByEnvironmentId()
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)
  const hydrateRuntimeEnvironmentStatuses = useAppStore((s) => s.hydrateRuntimeEnvironmentStatuses)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [menuOpen, setMenuOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [repairTarget, setRepairTarget] = useState<{ id: string; label: string } | null>(null)

  const projectHostIds = useMemo(
    () => new Set(repos.flatMap((repo) => (repo.connectionId ? [repo.connectionId] : []))),
    [repos]
  )
  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const userManagedEnvironments = runtimeEnvironments.filter(isListedRemoteServer)
  // Why the registry: a managed server and its SSH host are one machine, shown on its active route.
  const visibleHosts = new Map(
    pickerExecutionHosts(
      buildExecutionHostRegistry({
        repos: [],
        settings,
        hostSource: 'configured-only',
        sshTargetLabels,
        sshConnectionStates,
        runtimeEnvironments: userManagedEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      })
    ).map((host) => [host.id, host])
  )
  const targets = Array.from(sshTargetLabels.entries())
    // Hide runtime-owned per-workspace SSH targets from the user-managed host list.
    .filter(([id]) => !isOwnedSshTargetId(id) && visibleHosts.has(toSshExecutionHostId(id)))
    .map(([id, label]) => {
      const state = sshConnectionStates.get(id)
      return {
        id,
        label: visibleHosts.get(toSshExecutionHostId(id))?.label || label,
        status: state?.status ?? ('disconnected' satisfies SshConnectionStatus)
      }
    })
  const runtimeHosts = userManagedEnvironments
    .filter((environment) => visibleHosts.has(toRuntimeExecutionHostId(environment.id)))
    .map((environment) => {
      const statusEntry = runtimeStatusByEnvironmentId.get(environment.id)
      const registryHost = visibleHosts.get(toRuntimeExecutionHostId(environment.id))
      // Why the registry's verdict: it is the same blocked reason the sidebar and Settings show.
      const blockedReason =
        registryHost?.health === 'blocked' ? registryHost.blockedReason : undefined
      const repairRoute = runtimePairingRepairRoute(environment)
      return {
        id: environment.id,
        label: registryHost?.label || environment.name || environment.id,
        blockedReason,
        blocked: blockedReason
          ? {
              ...runtimeHostBlockedCopy(blockedReason, registryHost?.compatibility, repairRoute, t),
              recovery: runtimeHostBlockedRecovery(blockedReason, repairRoute)
            }
          : null,
        snapshot: statusEntry?.snapshot,
        status: statusEntry?.status ?? null,
        active: settings?.activeRuntimeEnvironmentId === environment.id,
        remoteControl: statusEntry?.remoteControl ?? statusEntry?.status?.remoteControl ?? null,
        heldDisconnected: environment.reconnectOnLaunch === false
      }
    })
  const runtimeHostRows = runtimeHosts.map((host) => {
    const entry = runtimeStatusByEnvironmentId.get(host.id)
    const notAttempted =
      host.heldDisconnected &&
      !entry?.status &&
      entry?.snapshot?.transport !== 'connecting' &&
      entry?.snapshot?.transport !== 'ready'
    return {
      ...host,
      state: notAttempted ? ('disconnected' as const) : runtimeHostConnectionStateForEntry(entry)
    }
  })
  // Host health is independent of active runtime selection; available remote servers remain online.
  const connectedRuntimeHosts = runtimeHostRows.filter((host) =>
    isConnectedRuntimeHostState(host.state)
  )
  const inactiveRuntimeHosts = runtimeHostRows.filter(
    (host) => !isConnectedRuntimeHostState(host.state)
  )
  const {
    connected: connectedTargets,
    inactive: disconnectedTargets,
    hiddenIdleCount
  } = splitSshStatusMenuRows(targets, { projectHostIds })
  const connectRuntimeHost = useCallback(
    async (environmentId: string): Promise<void> => {
      if (await connectRuntimeHostAndReloadProjects(environmentId)) {
        recordFeatureInteraction('ssh')
      }
    },
    [recordFeatureInteraction]
  )
  const disconnectRuntimeHost = useCallback(
    async (environmentId: string): Promise<void> => {
      try {
        await window.api.runtimeEnvironments.disconnect({ selector: environmentId })
        await readRuntimeHostStatusSnapshots()
        recordFeatureInteraction('ssh')
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate(
                'auto.components.status.bar.SshStatusSegment.runtime_disconnect_failed',
                'Disconnect failed'
              )
        )
      }
    },
    [recordFeatureInteraction, readRuntimeHostStatusSnapshots]
  )

  if (!rail && targets.length === 0 && runtimeHosts.length === 0) {
    return null
  }

  const statuses = [
    ...targets.map((target) => sshStatusForOverall(target.status)),
    ...runtimeHostRows.map((host) => runtimeHostStatusForOverall(host.state, host.blockedReason))
  ]
  const connectedHostCount = statuses.filter((status) => status === 'connected').length
  const hasBlockedHost = statuses.includes('blocked')
  const hasConnectingHost = statuses.includes('connecting')
  const openRecovery = (host: {
    id: string
    label: string
    blocked: { recovery: RuntimeHostBlockedRecovery | null } | null
  }): void => {
    // Why close first: the dialog must not open underneath the menu's focus trap.
    setMenuOpen(false)
    if (host.blocked?.recovery === 'open-settings') {
      const state = useAppStore.getState()
      state.openSettingsTarget({ pane: 'servers', repoId: null, sectionId: host.id })
      state.openSettingsPage()
      return
    }
    setRepairTarget({ id: host.id, label: host.label })
  }
  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open)
        if (open) {
          void hydrateRuntimeEnvironmentStatuses()
          void syncSshConfigTargetsPassively()
          recordFeatureInteraction('ssh')
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={
            rail
              ? 'relative grid size-10 shrink-0 place-items-center rounded-lg text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-accent'
              : 'inline-flex shrink-0 items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 text-muted-foreground hover:bg-accent/70'
          }
          title={
            rail
              ? t(
                  'auto.components.status.bar.SshStatusSegment.fdc57e9970',
                  'Remote host connection status'
                )
              : undefined
          }
          aria-label={t(
            'auto.components.status.bar.SshStatusSegment.fdc57e9970',
            'Remote host connection status'
          )}
        >
          {rail ? (
            <>
              <MonitorSmartphone className="size-4.5" strokeWidth={1.75} />
              {hasBlockedHost || hasConnectingHost ? (
                <span
                  aria-hidden
                  className={`absolute top-1.5 right-1.5 size-1.5 rounded-full ${hasBlockedHost ? 'bg-destructive' : 'bg-amber-500'}`}
                />
              ) : null}
            </>
          ) : (
            <>
              <Server className="size-3" />
              <span className="inline-grid text-2xs tabular-nums">
                {/* Reserve both localized forms so count changes don't resize the bar. */}
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {connectedHostCountLabel(1, t)}
                </span>
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {connectedHostCountLabel(Math.max(99, statuses.length), t)}
                </span>
                <span className="col-start-1 row-start-1">
                  {connectedHostCountLabel(connectedHostCount, t)}
                </span>
              </span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={rail ? 'right' : 'top'}
        align="start"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-1rem))]"
        onCloseAutoFocus={(event) => {
          // Why: the host search takes focus as the menu closes; the trigger must not take it back.
          if (findOpen) {
            event.preventDefault()
          }
        }}
      >
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t('auto.components.status.bar.SshStatusSegment.6e8a9a4242', 'Remote Hosts')}
        </div>
        {connectedRuntimeHosts.map((host) => (
          <RuntimeHostStatusRow
            key={host.id}
            label={host.label}
            state={host.state}
            detail={runtimeHostConnectionDetail(host.remoteControl, t)}
            diagnostics={host.remoteControl}
            blocked={host.blocked}
            onConnect={() => connectRuntimeHost(host.id)}
            onDisconnect={() => disconnectRuntimeHost(host.id)}
            onRecover={() => openRecovery(host)}
          />
        ))}
        {connectedTargets.map((target) => (
          <SshTargetStatusRow
            key={target.id}
            targetId={target.id}
            label={target.label}
            status={target.status}
          />
        ))}
        {inactiveRuntimeHosts.map((host) => (
          <RuntimeHostStatusRow
            key={host.id}
            label={host.label}
            state={host.state}
            detail={runtimeHostConnectionDetail(host.remoteControl, t)}
            diagnostics={host.remoteControl}
            blocked={host.blocked}
            onConnect={() => connectRuntimeHost(host.id)}
            onDisconnect={() => disconnectRuntimeHost(host.id)}
            onRecover={() => openRecovery(host)}
          />
        ))}
        {disconnectedTargets.map((target) => (
          <SshTargetStatusRow
            key={target.id}
            targetId={target.id}
            label={target.label}
            status={target.status}
          />
        ))}
        {hiddenIdleCount > 0 ? (
          // Why a search and not a Settings link: web clients connect hosts here but have no SSH pane.
          <DropdownMenuItem onSelect={() => setFindOpen(true)}>
            {moreSshHostsLabel(hiddenIdleCount, t)}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <TeamHostRefreshMenuItem />
        <DropdownMenuItem
          onSelect={() => {
            recordFeatureInteraction('ssh')
            openSettingsTarget({ pane: 'servers', repoId: null })
            setActiveView('settings')
          }}
        >
          {t('auto.components.status.bar.SshStatusSegment.3ad70e0365', 'Manage Remote Hosts…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <SshHostFindPopover
        open={findOpen}
        onOpenChange={setFindOpen}
        targets={targets}
        anchorRef={triggerRef}
      />
      {repairTarget && (
        <RuntimeRepairDialog
          open
          onOpenChange={(open) => !open && setRepairTarget(null)}
          environmentId={repairTarget.id}
          name={repairTarget.label}
        />
      )}
    </DropdownMenu>
  )
}
