import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/useMountedRef'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult,
  RuntimeAccessGrant
} from '../../../../shared/runtime-access-grants'
import { useRuntimePairingLinkRecall } from './use-runtime-pairing-link-recall'
import { Check, Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { RuntimeAccessGrantList } from './RuntimeAccessGrantList'
import { RuntimeAccessAuditLog } from './RuntimeAccessAuditLog'
import { translate } from '@/i18n/i18n'
import { RuntimePairingGeneratorForm } from './RuntimePairingGeneratorForm'
import {
  RUNTIME_PAIRING_LOOPBACK_ADDRESS,
  cacheGeneratedRuntimePairingLink,
  runtimePairingLinkCache,
  runtimePairingReachForIntent,
  selectRuntimePairingIntent,
  type RuntimePairingIntent,
  type RuntimePairingUrlGeneratorProps
} from './runtime-pairing-link-state'

export function RuntimePairingUrlGenerator({
  framed = true,
  showHeader = true,
  showGeneratorForm = true,
  accessMode,
  teamBinding
}: RuntimePairingUrlGeneratorProps): React.JSX.Element {
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>(
    []
  )
  const {
    selectedAddress,
    setSelectedAddress,
    intent,
    setIntent,
    generatedAddress,
    setGeneratedAddress,
    runtimePairingUrl,
    setRuntimePairingUrl,
    webClientUrl,
    setWebClientUrl,
    runtimePairingDeviceId,
    setRuntimePairingDeviceId,
    linkEditRevisionRef,
    clearRevokedLink
  } = useRuntimePairingLinkRecall()
  const [runtimeAccessGrants, setRuntimeAccessGrants] = useState<RuntimeAccessGrant[]>([])
  const [isLoadingAccessGrants, setIsLoadingAccessGrants] = useState(false)
  const [refreshingNetworkInterfaces, setRefreshingNetworkInterfaces] = useState(false)
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null)
  const [grantingFullAccess, setGrantingFullAccess] = useState(false)
  const [runtimeAccessAudit, setRuntimeAccessAudit] = useState<RuntimeAccessAuditEntry[]>([])
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [auditResult, setAuditResult] = useState<RuntimeAccessAuditResult | 'all'>('all')
  const [auditAction, setAuditAction] = useState('all')
  const [auditSinceDays, setAuditSinceDays] = useState<1 | 7 | 14>(14)
  const [auditSearch, setAuditSearch] = useState('')
  const [copiedTarget, setCopiedTarget] = useState<'web' | 'pairing' | null>(null)
  const [isGeneratingPairing, setIsGeneratingPairing] = useState(false)
  const networkInterfaceLoadIdRef = useRef(0)
  const accessGrantLoadIdRef = useRef(0)
  const copiedTargetResetTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const clearCopiedTargetResetTimer = useCallback((): void => {
    if (copiedTargetResetTimerRef.current === null) {
      return
    }
    window.clearTimeout(copiedTargetResetTimerRef.current)
    copiedTargetResetTimerRef.current = null
  }, [])

  const setContainerNode = useCallback(
    (node: HTMLDivElement | null): void => {
      // Why: copy feedback timers are owned by this settings surface; clear
      // them when Settings collapses or navigates away.
      if (!node) {
        clearCopiedTargetResetTimer()
      }
    },
    [clearCopiedTargetResetTimer]
  )

  const loadRuntimeAccessGrants = useCallback(
    async (options: { showToastOnError?: boolean } = {}): Promise<void> => {
      const loadId = accessGrantLoadIdRef.current + 1
      accessGrantLoadIdRef.current = loadId
      if (mountedRef.current) {
        setIsLoadingAccessGrants(true)
      }
      try {
        const result = await window.api.mobile.listRuntimeAccessGrants()
        if (mountedRef.current && loadId === accessGrantLoadIdRef.current) {
          setRuntimeAccessGrants(result.grants)
        }
      } catch (error) {
        if (
          mountedRef.current &&
          loadId === accessGrantLoadIdRef.current &&
          options.showToastOnError
        ) {
          toast.error(
            error instanceof Error
              ? error.message
              : translate(
                  'auto.components.settings.RuntimePairingUrlGenerator.1b4e0bbcc5',
                  'Failed to load shared access grants.'
                )
          )
        }
      } finally {
        if (mountedRef.current && loadId === accessGrantLoadIdRef.current) {
          setIsLoadingAccessGrants(false)
        }
      }
    },
    [mountedRef]
  )

  const loadRuntimeAccessAudit = useCallback(async (): Promise<void> => {
    if (!window.api.mobile.listRuntimeAccessAudit) {
      return
    }
    setIsLoadingAudit(true)
    try {
      const result = await window.api.mobile.listRuntimeAccessAudit({
        action: auditAction === 'all' ? undefined : auditAction,
        result: auditResult === 'all' ? undefined : auditResult,
        search: auditSearch.trim() || undefined,
        since: Date.now() - auditSinceDays * 24 * 60 * 60 * 1000
      })
      if (mountedRef.current) {
        setRuntimeAccessAudit(result.entries)
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.failedToLoadAccessLog',
                'Failed to load access log.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingAudit(false)
      }
    }
  }, [auditAction, auditResult, auditSearch, auditSinceDays, mountedRef])

  const clearRuntimeAccessAudit = useCallback(async (): Promise<void> => {
    if (
      runtimeAccessAudit.length === 0 ||
      !window.confirm(
        translate(
          'auto.components.settings.RuntimePairingUrlGenerator.clearConfirm',
          "Clear this host's shared access log?"
        )
      )
    ) {
      return
    }
    try {
      const result = await window.api.mobile.clearRuntimeAccessAudit()
      if (result.cleared && mountedRef.current) {
        setRuntimeAccessAudit([])
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.clearFailed',
                'Failed to clear shared access log.'
              )
        )
      }
    }
  }, [mountedRef, runtimeAccessAudit.length])

  const loadNetworkInterfaces = useCallback(
    async (options: { showToastOnError?: boolean } = {}): Promise<void> => {
      const loadId = networkInterfaceLoadIdRef.current + 1
      networkInterfaceLoadIdRef.current = loadId
      if (mountedRef.current) {
        setRefreshingNetworkInterfaces(true)
      }
      try {
        const result = await window.api.mobile.listNetworkInterfaces()
        if (mountedRef.current && loadId === networkInterfaceLoadIdRef.current) {
          setNetworkInterfaces(result.interfaces)
        }
      } catch {
        if (
          mountedRef.current &&
          loadId === networkInterfaceLoadIdRef.current &&
          options.showToastOnError
        ) {
          toast.error(
            translate(
              'auto.components.settings.RuntimePairingUrlGenerator.95b8be4cea',
              'Failed to refresh network interfaces.'
            )
          )
        }
      } finally {
        if (mountedRef.current && loadId === networkInterfaceLoadIdRef.current) {
          setRefreshingNetworkInterfaces(false)
        }
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    void loadNetworkInterfaces()
    return () => {
      networkInterfaceLoadIdRef.current += 1
    }
  }, [loadNetworkInterfaces])

  useEffect(() => {
    if (intent !== 'another' || networkInterfaces.length === 0) {
      return
    }
    const addressStillAvailable = networkInterfaces.some(
      (networkInterface) => networkInterface.address === selectedAddress
    )
    if (!addressStillAvailable) {
      const nextAddress = networkInterfaces[0]?.address ?? ''
      runtimePairingLinkCache.selectedAddress = nextAddress
      setSelectedAddress(nextAddress)
    }
  }, [intent, networkInterfaces, selectedAddress, setSelectedAddress])

  useEffect(() => {
    void loadRuntimeAccessGrants()
    return () => {
      accessGrantLoadIdRef.current += 1
    }
  }, [loadRuntimeAccessGrants])

  useEffect(() => {
    void loadRuntimeAccessAudit()
  }, [loadRuntimeAccessAudit])

  const generateRuntimePairingUrl = async (): Promise<void> => {
    linkEditRevisionRef.current += 1
    const address = selectedAddress.trim()
    runtimePairingLinkCache.selectedAddress = address
    setSelectedAddress(address)
    if (intent === 'custom') {
      runtimePairingLinkCache.customAddress = address
    }
    setIsGeneratingPairing(true)
    try {
      const result = await window.api.mobile.getRuntimePairingUrl({
        address,
        rotate: true,
        // Why: main gates the one-way network widen on this, so the declared choice must travel with the
        // address — the address alone cannot tell "This computer only" from a loopback tunnel front-end.
        reach: runtimePairingReachForIntent(intent),
        ...(accessMode ? { accessMode } : undefined),
        ...(teamBinding ? { teamBinding } : undefined)
      })
      if (!result.available) {
        if (mountedRef.current) {
          // Why: STA-2370 — surface the specific network-exposure guidance when the widen failed; fall back
          // to the generic message for other unavailable cases (e.g. no reachable address).
          toast.error(
            result.guidance ??
              translate(
                'auto.components.settings.RuntimePairingUrlGenerator.2752126f3e',
                'Runtime pairing is unavailable.'
              )
          )
        }
        return
      }
      cacheGeneratedRuntimePairingLink({
        address,
        intent,
        pairingUrl: result.pairingUrl,
        webClientUrl: result.webClientUrl,
        deviceId: result.deviceId
      })
      if (mountedRef.current) {
        setRuntimePairingUrl(result.pairingUrl)
        setWebClientUrl(result.webClientUrl)
        setRuntimePairingDeviceId(result.deviceId)
        setGeneratedAddress(address)
      }
      await loadRuntimeAccessGrants()
      if (mountedRef.current) {
        toast.success(
          result.webClientUrl
            ? translate(
                'auto.components.settings.RuntimePairingUrlGenerator.6dd594a507',
                'Generated web client URL.'
              )
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.11d5248e62',
                'Generated pairing URL.'
              )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.2ed55c841a',
                'Failed to generate pairing URL.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsGeneratingPairing(false)
      }
    }
  }

  const revokeRuntimeAccess = async (grant: RuntimeAccessGrant): Promise<void> => {
    setRevokingGrantId(grant.deviceId)
    try {
      const result = await window.api.mobile.revokeRuntimeAccess({ deviceId: grant.deviceId })
      clearRevokedLink(grant.deviceId)
      if (!result.revoked) {
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.settings.RuntimePairingUrlGenerator.d797f516b1',
              'Shared access was already revoked.'
            )
          )
        }
        await loadRuntimeAccessGrants()
        return
      }
      if (mountedRef.current) {
        setRuntimeAccessGrants((current) =>
          current.filter((entry) => entry.deviceId !== grant.deviceId)
        )
      }
      if (mountedRef.current) {
        toast.success(
          translate(
            'auto.components.settings.RuntimePairingUrlGenerator.9f8e037c4a',
            'Shared access revoked.'
          )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.e8d83f2b0f',
                'Failed to revoke shared access.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setRevokingGrantId(null)
      }
    }
  }

  const grantRuntimeFullAccess = async (grants: RuntimeAccessGrant[]): Promise<boolean> => {
    if (grants.length === 0) {
      return false
    }
    setGrantingFullAccess(true)
    try {
      const result = await window.api.mobile.grantRuntimeFullAccess({
        deviceIds: grants.map((grant) => grant.deviceId)
      })
      await loadRuntimeAccessGrants()
      if (mountedRef.current) {
        toast.success(
          result.granted.length === 1
            ? translate(
                'auto.components.settings.RuntimePairingUrlGenerator.fullAccessGranted',
                'Full access granted.'
              )
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.fullAccessGrantedCount',
                'Full access granted to {{value0}} devices.',
                { value0: result.granted.length }
              )
        )
      }
      return result.granted.length === grants.length
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.fullAccessGrantFailed',
                'Failed to grant full access.'
              )
        )
      }
      return false
    } finally {
      if (mountedRef.current) {
        setGrantingFullAccess(false)
      }
    }
  }

  const copyGeneratedUrl = async (target: 'web' | 'pairing', value: string): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(value)
      if (mountedRef.current) {
        clearCopiedTargetResetTimer()
        setCopiedTarget(target)
        copiedTargetResetTimerRef.current = window.setTimeout(() => {
          copiedTargetResetTimerRef.current = null
          if (mountedRef.current) {
            setCopiedTarget((current) => (current === target ? null : current))
          }
        }, 1400)
        toast.success(
          target === 'web'
            ? translate(
                'auto.components.settings.RuntimePairingUrlGenerator.13704d635e',
                'Copied web client URL.'
              )
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.df0aa45a86',
                'Copied pairing URL.'
              )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.d6c081adf4',
                'Failed to copy URL.'
              )
        )
      }
    }
  }

  const containerClassName = framed
    ? 'space-y-3 rounded-lg border border-border/50 bg-muted/25 p-3'
    : 'space-y-4'
  const sharedAccessClassName = showGeneratorForm ? 'border-t border-border/40 pt-3' : ''

  const updateSelectedAddress = (address: string): void => {
    linkEditRevisionRef.current += 1
    runtimePairingLinkCache.selectedAddress = address
    setSelectedAddress(address)
    if (
      intent === 'another' &&
      !networkInterfaces.some((networkInterface) => networkInterface.address === address)
    ) {
      runtimePairingLinkCache.customAddress = address
      runtimePairingLinkCache.intent = 'custom'
      setIntent('custom')
    } else if (intent === 'custom') {
      runtimePairingLinkCache.customAddress = address
    }
  }

  const updateIntent = (nextIntent: RuntimePairingIntent): void => {
    linkEditRevisionRef.current += 1
    setIntent(nextIntent)
    setSelectedAddress(
      selectRuntimePairingIntent(
        nextIntent,
        networkInterfaces,
        runtimePairingLinkCache.customAddress
      )
    )
  }

  return (
    <div ref={setContainerNode} className={containerClassName}>
      {showHeader ? (
        <div className="space-y-1">
          <Label id="runtime-share-server-label">
            {translate(
              'auto.components.settings.RuntimePairingUrlGenerator.f8500e134a',
              'Share this Orca server'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.RuntimePairingUrlGenerator.ff80904fc4',
              'Create a revocable access grant for browser or desktop clients.'
            )}
          </p>
        </div>
      ) : null}
      {showGeneratorForm ? (
        <RuntimePairingGeneratorForm
          intent={intent}
          loopbackAddress={RUNTIME_PAIRING_LOOPBACK_ADDRESS}
          networkInterfaces={networkInterfaces}
          selectedAddress={selectedAddress}
          refreshingNetworkInterfaces={refreshingNetworkInterfaces}
          isGeneratingPairing={isGeneratingPairing}
          webClientUrl={webClientUrl}
          runtimePairingUrl={runtimePairingUrl}
          copiedTarget={copiedTarget}
          generatedAddress={generatedAddress}
          onIntentChange={updateIntent}
          onSelectedAddressChange={updateSelectedAddress}
          onRefreshNetworkInterfaces={() => void loadNetworkInterfaces({ showToastOnError: true })}
          onGenerate={() => void generateRuntimePairingUrl()}
          onCopy={(target, value) => void copyGeneratedUrl(target, value)}
        />
      ) : null}

      {!showGeneratorForm && runtimePairingUrl ? (
        <div className="space-y-1.5">
          <Label htmlFor="runtime-share-access-link">
            {translate(
              'auto.components.settings.RuntimePairingUrlGenerator.accessLink',
              'Access link'
            )}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="runtime-share-access-link"
              readOnly
              value={runtimePairingUrl}
              className="h-8 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyGeneratedUrl('pairing', runtimePairingUrl)}
            >
              {copiedTarget === 'pairing' ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {translate('auto.components.settings.RuntimePairingUrlGenerator.copyLink', 'Copy')}
            </Button>
          </div>
        </div>
      ) : null}

      <RuntimeAccessGrantList
        className={sharedAccessClassName}
        grants={runtimeAccessGrants}
        currentGrantId={runtimePairingDeviceId}
        isLoading={isLoadingAccessGrants}
        revokingGrantId={revokingGrantId}
        grantingFullAccess={grantingFullAccess}
        onRefresh={() => void loadRuntimeAccessGrants({ showToastOnError: true })}
        onRevoke={(grant) => void revokeRuntimeAccess(grant)}
        onGrantFullAccess={grantRuntimeFullAccess}
      />
      <RuntimeAccessAuditLog
        entries={runtimeAccessAudit}
        isLoading={isLoadingAudit}
        action={auditAction}
        result={auditResult}
        sinceDays={auditSinceDays}
        search={auditSearch}
        onActionChange={setAuditAction}
        onResultChange={setAuditResult}
        onSinceDaysChange={setAuditSinceDays}
        onSearchChange={setAuditSearch}
        onRefresh={() => void loadRuntimeAccessAudit()}
        onClear={() => void clearRuntimeAccessAudit()}
      />
    </div>
  )
}
