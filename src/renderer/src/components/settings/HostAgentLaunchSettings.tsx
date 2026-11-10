import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentLaunchSettings,
  AgentLaunchSettingsMutation
} from '../../../../shared/agent-launch-settings'
import {
  getTuiAgentDefaultArgs,
  resolveTuiAgentLaunchArgs
} from '../../../../shared/tui-agent-launch-defaults'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import {
  mutateHostAgentLaunchSettings,
  readHostAgentLaunchSettings,
  type AgentLaunchSettingsOwner
} from '@/runtime/agent-launch-settings/agent-launch-settings-transport'
import { AgentCatalogRow } from './AgentCatalogRow'
import { AgentDefaultSetting } from './AgentDefaultSetting'
import { HostAgentEnvironmentEditor } from './HostAgentEnvironmentEditor'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'

type ReadState =
  | { kind: 'loading' | 'unsupported' | 'failed' }
  | { kind: 'ready'; settings: AgentLaunchSettings }

type HostAgentLaunchSettingsProps = AgentLaunchSettingsOwner & {
  hostName: string
  renderPermissions: (
    mode: AgentLaunchSettings['permissionMode'],
    onChange: (mode: 'manual' | 'yolo') => void
  ) => React.JSX.Element
}

export function HostAgentLaunchSettings({
  environmentId,
  pairingRevision,
  runtimeId,
  hostName,
  renderPermissions
}: HostAgentLaunchSettingsProps): React.JSX.Element {
  const owner = useMemo(
    () => ({ environmentId, pairingRevision, runtimeId }),
    [environmentId, pairingRevision, runtimeId]
  )
  const target = useMemo(() => ({ kind: 'runtime' as const, environmentId }), [environmentId])
  const {
    detectedIds,
    detectionFailed,
    isRefreshing,
    refresh: refreshAgents
  } = useDetectedAgents(target)
  const controllerRef = useRef<AbortController | null>(null)
  const currentRead = useRef<ReadState>({ kind: 'loading' })
  const [read, publishRead] = useState(currentRead.current)
  const setRead = useCallback((next: ReadState): void => {
    currentRead.current = next
    publishRead(next)
  }, [])
  const [saveFailed, setSaveFailed] = useState(false)
  const mutationTail = useRef<Promise<void> | null>(null)
  const refresh = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRead({ kind: 'loading' })
    try {
      const settings = await readHostAgentLaunchSettings(owner, controller.signal)
      if (!controller.signal.aborted) {
        setRead(settings ? { kind: 'ready', settings } : { kind: 'unsupported' })
      }
    } catch {
      if (!controller.signal.aborted) {
        setRead({ kind: 'failed' })
      }
    }
  }, [owner, setRead])
  useEffect(() => {
    void refresh()
    return () => controllerRef.current?.abort()
  }, [refresh])
  const mutate = (mutation: AgentLaunchSettingsMutation): Promise<void> => {
    const controller = controllerRef.current
    const write = (mutationTail.current ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!controller || controller.signal.aborted || currentRead.current.kind !== 'ready') {
          throw new Error('agent_launch_settings_unavailable')
        }
        setSaveFailed(false)
        try {
          const settings = await mutateHostAgentLaunchSettings(owner, mutation, controller.signal)
          if (!controller.signal.aborted) {
            setRead({ kind: 'ready', settings })
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setSaveFailed(true)
          }
          throw error
        }
      })
    mutationTail.current = write
    return write
  }
  const save = (mutation: AgentLaunchSettingsMutation): void => {
    void mutate(mutation).catch(() => {})
  }
  if (read.kind !== 'ready') {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{hostName}</p>
        <p>
          {read.kind === 'loading'
            ? translate('settings.agents.loading', 'Loading agent settings…')
            : read.kind === 'unsupported'
              ? translate(
                  'settings.agents.updateHost',
                  'Update this server to edit its agent launch settings.'
                )
              : translate(
                  'settings.agents.readFailed',
                  'Couldn’t read agent settings. Check the host connection and try again.'
                )}
        </p>
        {read.kind === 'failed' ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => void refresh()}>
            {translate('auto.components.settings.AgentsPane.retryDetection', 'Retry')}
          </Button>
        ) : null}
      </div>
    )
  }
  const settings = read.settings
  const catalog = getAgentCatalog()
  const detected = detectedIds ? new Set(detectedIds) : null
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{hostName}</p>
      <AgentDefaultSetting
        defaultAgent={settings.defaultTuiAgent}
        detectedIds={detected}
        enabledDetectedAgents={catalog.filter(
          (agent) =>
            detected?.has(agent.id) && isTuiAgentEnabled(agent.id, settings.disabledTuiAgents)
        )}
        catalog={catalog}
        description={translate(
          'settings.agents.hostDefaults',
          'Defaults for agents launched on this host.'
        )}
        onSetDefault={(agent) => save({ type: 'default', agent })}
      />
      {renderPermissions(settings.permissionMode, (mode) => save({ type: 'permissions', mode }))}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={isRefreshing}
        onClick={() => {
          void refresh()
          void refreshAgents()
        }}
      >
        {translate('settings.agents.refresh', 'Refresh')}
      </Button>
      {detectionFailed ? (
        <p role="alert">
          {translate('settings.agents.detectionFailed', 'Couldn’t detect agents on this host.')}
        </p>
      ) : null}
      {catalog.map((agent) => (
        <AgentCatalogRow
          key={agent.id}
          agentId={agent.id}
          label={agent.label}
          homepageUrl={agent.homepageUrl}
          defaultCmd={agent.cmd}
          defaultArgs={getTuiAgentDefaultArgs(agent.id)}
          defaultEnv={{}}
          isDetected={detected?.has(agent.id) ?? false}
          isEnabled={isTuiAgentEnabled(agent.id, settings.disabledTuiAgents)}
          isDefault={settings.defaultTuiAgent === agent.id}
          cmdOverride={settings.agentCmdOverrides[agent.id]}
          argsOverride={resolveTuiAgentLaunchArgs(agent.id, settings.agentDefaultArgs)}
          envOverride={{}}
          onSetDefault={() => save({ type: 'default', agent: agent.id })}
          onSetEnabled={(enabled) => save({ type: 'availability', agent: agent.id, enabled })}
          onSaveOverride={(value) => mutate({ type: 'command', agent: agent.id, value })}
          onSaveArgs={(value) => mutate({ type: 'arguments', agent: agent.id, value })}
          onSaveEnv={() => {}}
          environmentEditor={
            <HostAgentEnvironmentEditor
              agent={agent.id}
              names={settings.environmentNames[agent.id] ?? []}
              mutate={mutate}
            />
          }
        />
      ))}
      {saveFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {translate(
            'settings.agents.saveFailed',
            'Couldn’t save agent settings. Check the host connection and try again.'
          )}
        </p>
      ) : null}
    </div>
  )
}
