import { Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { RuntimeAccessGrant } from '../../../../shared/remote-runtime/host-catalog/runtime-access-grants'
import { Button } from '../ui/button'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { translate } from '@/i18n/i18n'

function GrantAvatar({ grant }: { grant: RuntimeAccessGrant }): React.JSX.Element {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (grant.avatar && failedSource !== grant.avatar) {
    return (
      <img
        src={grant.avatar}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover"
        onError={() => setFailedSource(grant.avatar ?? null)}
      />
    )
  }
  return (
    <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {grant.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

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
  /** The member whose access is being switched, so only that row waits. */
  changingAccessGrantId: string | null
  onRefresh: () => void
  onRevoke: (grant: RuntimeAccessGrant) => void
  onCopyLink: (grant: RuntimeAccessGrant) => void
  onChangeAccessMode: (grant: RuntimeAccessGrant, accessMode: 'team-read' | 'full') => void
}

export function RuntimeAccessGrantList({
  className,
  grants,
  currentGrantId,
  isLoading,
  revokingGrantId,
  changingAccessGrantId,
  onRefresh,
  onRevoke,
  onCopyLink,
  onChangeAccessMode
}: RuntimeAccessGrantListProps): React.JSX.Element {
  // A shared team link has one record per connected member, so the list is always split into who
  // connected and the links themselves (a leaked link can still be revoked as a whole). The tabs stay
  // in place when one side is empty so the view never changes shape.
  const [view, setView] = useState<'members' | 'links'>('members')
  const visibleGrants = useMemo(
    () => grants.filter((grant) => (grant.parentDeviceId !== undefined) === (view === 'members')),
    [grants, view]
  )
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {translate('auto.components.settings.RuntimeAccessGrantList.title', 'Shared links')}
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

      <div className="mb-2 flex items-center gap-1">
        {(['members', 'links'] as const).map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="xs"
            variant={view === candidate ? 'secondary' : 'ghost'}
            onClick={() => setView(candidate)}
          >
            {candidate === 'members'
              ? translate('auto.components.settings.RuntimeAccessGrantList.viewMembers', 'Members')
              : translate('auto.components.settings.RuntimeAccessGrantList.viewLinks', 'Links')}
          </Button>
        ))}
      </div>

      {visibleGrants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {view === 'members'
            ? translate(
                'auto.components.settings.RuntimeAccessGrantList.noMembers',
                'No one has connected yet.'
              )
            : translate(
                'auto.components.settings.RuntimeAccessGrantList.fd83b94095',
                'No shared server access yet.'
              )}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleGrants.map((grant) => {
            const isCurrent = currentGrantId === grant.deviceId
            const isRevoking = revokingGrantId === grant.deviceId
            const isMember = grant.parentDeviceId !== undefined
            return (
              <div
                key={grant.deviceId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <GrantAvatar grant={grant} />
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
                    {isMember ? null : (
                      <>
                        {grant.accessMode === 'team-read'
                          ? translate(
                              'auto.components.settings.RuntimeAccessGrantList.teamReadonly',
                              'Team read-only'
                            )
                          : translate(
                              'auto.components.settings.RuntimeAccessGrantList.fullAccess',
                              'Full access'
                            )}
                        {' · '}
                      </>
                    )}
                    {grant.connected === true
                      ? translate(
                          'auto.components.settings.RuntimeAccessGrantList.connected',
                          'Connected'
                        )
                      : grant.lastSeenAt
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
                </div>
                {isMember ? (
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={grant.accessMode}
                    disabled={changingAccessGrantId === grant.deviceId}
                    onValueChange={(value) => {
                      if (value === 'team-read' || value === 'full') {
                        if (value !== grant.accessMode) {
                          onChangeAccessMode(grant, value)
                        }
                      }
                    }}
                    className="ml-auto shrink-0"
                    aria-label={grant.name}
                  >
                    <ToggleGroupItem value="team-read" className="px-2 text-xs">
                      {translate(
                        'auto.components.settings.RuntimeAccessGrantList.accessReadOnly',
                        'Read-only'
                      )}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="full"
                      className="px-2 text-xs"
                      disabled={grant.accessMode === 'team-read' && grant.connected !== true}
                      title={
                        grant.accessMode === 'team-read' && grant.connected !== true
                          ? translate(
                              'auto.components.settings.RuntimeAccessGrantList.fullAccessNeedsConnection',
                              'Full access can only be given to a connected member.'
                            )
                          : undefined
                      }
                    >
                      {translate(
                        'auto.components.settings.RuntimeAccessGrantList.fullAccess',
                        'Full access'
                      )}
                    </ToggleGroupItem>
                  </ToggleGroup>
                ) : null}
                {grant.parentDeviceId === undefined ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => onCopyLink(grant)}
                        aria-label={translate(
                          'auto.components.settings.RuntimeAccessGrantList.copyLink',
                          'Copy link for {{value0}}',
                          { value0: grant.name }
                        )}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={4}>
                      {translate(
                        'auto.components.settings.RuntimeAccessGrantList.copyLinkTooltip',
                        'Copy link'
                      )}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
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
