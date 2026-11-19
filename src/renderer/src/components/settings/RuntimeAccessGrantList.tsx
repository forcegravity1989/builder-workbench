import { Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { RuntimeAccessGrant } from '../../../../shared/runtime-access-grants'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { translate } from '@/i18n/i18n'

function formatAccessTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

type RuntimeAccessGrantListProps = {
  className?: string
  grants: RuntimeAccessGrant[]
  currentGrantId: string | null
  isLoading: boolean
  revokingGrantId: string | null
  grantingFullAccess: boolean
  onRefresh: () => void
  onRevoke: (grant: RuntimeAccessGrant) => void
  onGrantFullAccess: (grants: RuntimeAccessGrant[]) => Promise<void>
}

export function RuntimeAccessGrantList({
  className,
  grants,
  currentGrantId,
  isLoading,
  revokingGrantId,
  grantingFullAccess,
  onRefresh,
  onRevoke,
  onGrantFullAccess
}: RuntimeAccessGrantListProps): React.JSX.Element {
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([])
  const selectableGrants = useMemo(
    () => grants.filter((grant) => grant.accessMode === 'team-read' && grant.connected === true),
    [grants]
  )
  const selectedGrants = selectableGrants.filter((grant) => selectedGrantIds.includes(grant.deviceId))

  const toggleGrant = (deviceId: string): void => {
    setSelectedGrantIds((current) =>
      current.includes(deviceId)
        ? current.filter((candidate) => candidate !== deviceId)
        : [...current, deviceId]
    )
  }

  const grantFullAccess = async (): Promise<void> => {
    await onGrantFullAccess(selectedGrants)
    setSelectedGrantIds([])
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {translate(
            'auto.components.settings.RuntimeAccessGrantList.f031182867',
            'Shared Server Access'
          )}
        </h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label={translate(
                'auto.components.settings.RuntimeAccessGrantList.27cf8507ad',
                'Refresh shared access'
              )}
            >
              <RefreshCw className={isLoading ? 'animate-spin' : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.settings.RuntimeAccessGrantList.27cf8507ad',
              'Refresh shared access'
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {grants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {translate(
            'auto.components.settings.RuntimeAccessGrantList.fd83b94095',
            'No shared server access yet.'
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {selectableGrants.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <div className="text-muted-foreground text-xs">
                {selectedGrants.length > 0
                  ? `${selectedGrants.length} selected`
                  : 'Select connected read-only devices'}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={selectedGrants.length === 0 || grantingFullAccess}
                onClick={() => void grantFullAccess()}
              >
                {grantingFullAccess ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="size-3.5" />
                )}
                Grant full access
              </Button>
            </div>
          ) : null}
          {grants.map((grant) => {
            const isCurrent = currentGrantId === grant.deviceId
            const isRevoking = revokingGrantId === grant.deviceId
            const canGrantFullAccess =
              grant.accessMode === 'team-read' && grant.connected === true
            return (
              <div
                key={grant.deviceId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                {canGrantFullAccess ? (
                  <input
                    type="checkbox"
                    checked={selectedGrantIds.includes(grant.deviceId)}
                    onChange={() => toggleGrant(grant.deviceId)}
                    aria-label={`Select ${grant.name} for full access`}
                    className="size-4 shrink-0"
                  />
                ) : null}
                <div className="min-w-0 space-y-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{grant.name}</span>
                    {isCurrent ? (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {translate(
                          'auto.components.settings.RuntimeAccessGrantList.434e4a6af6',
                          'Current link'
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {translate(
                      'auto.components.settings.RuntimeAccessGrantList.87b16cd11d',
                      'Created'
                    )}
                    {formatAccessTimestamp(grant.createdAt)} ·{' '}
                    {grant.lastSeenAt
                      ? translate(
                          'auto.components.settings.RuntimeAccessGrantList.b18d1764ef',
                          'Last used {{value0}}',
                          { value0: formatAccessTimestamp(grant.lastSeenAt) }
                        )
                      : translate(
                          'auto.components.settings.RuntimeAccessGrantList.df142657a5',
                          'Not used yet'
                        )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {grant.accessMode === 'team-read' ? 'Team read-only' : 'Full access'}
                    {grant.connected === true ? ' · Connected' : ''}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => onRevoke(grant)}
                      disabled={isRevoking}
                      aria-label={translate(
                        'auto.components.settings.RuntimeAccessGrantList.6f6d5188ed',
                        'Revoke {{value0}}',
                        { value0: grant.name }
                      )}
                    >
                      {isRevoking ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    {translate(
                      'auto.components.settings.RuntimeAccessGrantList.68ec21309f',
                      'Revoke access'
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}
      {grants.length > 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          {translate(
            'auto.components.settings.RuntimeAccessGrantList.8b82879581',
            'Anyone with an active grant can connect until you revoke it. Revoking shared access disconnects active clients immediately.'
          )}
        </p>
      ) : null}
    </div>
  )
}
