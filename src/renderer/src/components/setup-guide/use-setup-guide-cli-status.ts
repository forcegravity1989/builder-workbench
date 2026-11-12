import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import {
  ensureOrcaCliAvailableForAgentSkillTerminal,
  isOrcaCliAvailableOnPath
} from '@/lib/agent-skill-cli-prerequisite'
import { translate } from '@/i18n/i18n'
import {
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '../settings/CliSkillRuntimeSetup'

type CliProbe = {
  key: string | null
  status: CliInstallStatus | null
  checking: boolean
  registering: boolean
  error: string | null
}

const EMPTY_PROBE: CliProbe = {
  key: null,
  status: null,
  checking: false,
  registering: false,
  error: null
}
const probes = new Map<string, CliProbe>()
const pendingByKey = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const publish = (next: CliProbe & { key: string }): void => {
  probes.set(next.key, next)
  listeners.forEach((listener) => listener())
}

// Share native reads and registration results between the sidebar, modal and settings checklist.
function runProbe(
  key: string,
  operation: () => Promise<CliInstallStatus | null>,
  registering: boolean
): Promise<void> {
  const pending = pendingByKey.get(key)
  if (pending) {
    return pending
  }
  publish({ ...EMPTY_PROBE, key, checking: true, registering })
  const operationPromise = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Defer IPC until the shared in-flight promise is visible to every consumer.
      await Promise.resolve()
      const status = await (registering
        ? operation()
        : Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('CLI status check timed out')), 15_000)
            })
          ]))
      publish({ ...EMPTY_PROBE, key, status })
    } catch (error) {
      publish({
        ...EMPTY_PROBE,
        key,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      clearTimeout(timer)
      pendingByKey.delete(key)
    }
  })()
  pendingByKey.set(key, operationPromise)
  return operationPromise
}

export function useSetupGuideCliStatus(enabled = true) {
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const runtime = useActiveProjectSkillRuntime()
  const wslRuntime = runtime.agentRuntime?.runtime === 'wsl' ? runtime.agentRuntime : undefined
  // Native CLI IPC only manages this device and its WSL distributions, never a paired host.
  const key =
    runtimeTarget?.kind === 'local' && !runtime.installDisabledReason
      ? JSON.stringify(['local', wslRuntime?.runtime ?? 'host', wslRuntime?.wslDistro ?? null])
      : null
  const readProbe = useCallback(
    (): CliProbe => (key === null ? EMPTY_PROBE : (probes.get(key) ?? EMPTY_PROBE)),
    [key]
  )
  const snapshot = useSyncExternalStore(subscribe, readProbe, readProbe)
  const activationKey = enabled ? key : null
  const [activation, setActivation] = useState({ key: activationKey, staleProbe: snapshot })
  // A previously visited target's cached success is not evidence for this activation.
  if (activation.key !== activationKey) {
    setActivation({ key: activationKey, staleProbe: snapshot })
  }
  const unavailableReason =
    runtime.installDisabledReason ??
    (key === null
      ? translate(
          'guidance.cliTargetUnavailable',
          'CLI status cannot be checked for this execution host here. Manage it on that host, or skip this step.'
        )
      : null)
  const refresh = useCallback((): Promise<void> => {
    if (!enabled || key === null) {
      return Promise.resolve()
    }
    return runProbe(
      key,
      () =>
        wslRuntime
          ? window.api.cli.getWslInstallStatus(getWslCliDistroRequest(wslRuntime))
          : window.api.cli.getInstallStatus(),
      false
    )
  }, [enabled, key, wslRuntime])
  const register = useCallback((): Promise<void> => {
    if (!enabled || key === null) {
      return Promise.resolve()
    }
    return runProbe(
      key,
      () =>
        wslRuntime
          ? ensureWslCliAvailableForAgentSkillTerminal(wslRuntime)
          : ensureOrcaCliAvailableForAgentSkillTerminal(),
      true
    )
  }, [enabled, key, wslRuntime])

  useEffect(() => {
    void refresh()
    const onFocus = (): void => {
      void refresh()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  const current =
    enabled &&
    key !== null &&
    snapshot.key === key &&
    activation.key === activationKey &&
    snapshot !== activation.staleProbe
      ? snapshot
      : EMPTY_PROBE
  return {
    ...current,
    checked: key === null || (current.key === key && !current.checking),
    available: !current.checking && isOrcaCliAvailableOnPath(current.status),
    unavailableReason,
    runtimeLabel:
      wslRuntime?.label ??
      (runtimeTarget?.kind === 'local'
        ? translate('guidance.cliThisDevice', 'This device')
        : translate('guidance.cliCurrentHost', 'Current execution host')),
    refresh,
    register
  }
}

export type SetupGuideCliStatus = ReturnType<typeof useSetupGuideCliStatus>
