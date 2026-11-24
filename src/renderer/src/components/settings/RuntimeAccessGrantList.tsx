import { Copy, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { RuntimeAccessGrant } from '../../../../shared/runtime-access-grants'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
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
  grantingFullAccess: boolean
  onRefresh: () => void
  onRevoke: (grant: RuntimeAccessGrant) => void
  onCopyLink: (grant: RuntimeAccessGrant) => void
  onGrantFullAccess: (grants: RuntimeAccessGrant[]) => Promise<boolean>
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
  onCopyLink,
  onGrantFullAccess
}: RuntimeAccessGrantListProps): React.JSX.Element {
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  // A shared team link has one record per connected member, so the list is always split into who
  // connected and the links themselves (a leaked link can still be revoked as a whole). The tabs stay
  // in place when one side is empty so the view never changes shape.
  const [view, setView] = useState<'members' | 'links'>('members')
  const visibleGrants = useMemo(
    () => grants.filter((grant) => (grant.parentDeviceId !== undefined) === (view === 'members')),
    [grants, view]
  )
  const selectableGrants = useMemo(
    () =>
      visibleGrants.filter((grant) => grant.accessMode === 'team-read' && grant.connected === true),
    [visibleGrants]
  )
  const selectedGrants = selectableGrants.filter((grant) =>
    selectedGrantIds.includes(grant.deviceId)
  )

  const toggleGrant = (deviceId: string): void => {
    setSelectedGrantIds((current) =>
      current.includes(deviceId)
        ? current.filter((candidate) => candidate !== deviceId)
        : [...current, deviceId]
    )
  }

  const grantFullAccess = async (): Promise<void> => {
    const granted = await onGrantFullAccess(selectedGrants)
    if (granted) {
      setSelectedGrantIds([])
      setConfirmOpen(false)
    }
  }

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
          {selectableGrants.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <div className="text-muted-foreground text-xs">
                {selectedGrants.length > 0
                  ? translate(
                      'auto.components.settings.RuntimeAccessGrantList.selectedCount',
                      '{{value0}} selected',
                      { value0: selectedGrants.length }
                    )
                  : translate(
                      'auto.components.settings.RuntimeAccessGrantList.selectReadonly',
                      'Select connected read-only devices'
                    )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={selectedGrants.length === 0 || grantingFullAccess}
                onClick={() => setConfirmOpen(true)}
              >
                {grantingFullAccess ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="size-3.5" />
                )}
                {translate(
                  'auto.components.settings.RuntimeAccessGrantList.grantFullAccess',
                  'Grant full access'
                )}
              </Button>
            </div>
          ) : null}
          {visibleGrants.map((grant) => {
            const isCurrent = currentGrantId === grant.deviceId
            const isRevoking = revokingGrantId === grant.deviceId
            const canGrantFullAccess = grant.accessMode === 'team-read' && grant.connected === true
            return (
              <div
                key={grant.deviceId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                {canGrantFullAccess ? (
                  <Checkbox
                    checked={selectedGrantIds.includes(grant.deviceId)}
                    onCheckedChange={() => toggleGrant(grant.deviceId)}
                    aria-label={translate(
                      'auto.components.settings.RuntimeAccessGrantList.selectForFullAccess',
                      'Select {{value0}} for full access',
                      { value0: grant.name }
                    )}
                  />
                ) : (
                  <div className="size-4 shrink-0" aria-hidden="true" />
                )}
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
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.RuntimeAccessGrantList.confirmTitle',
                'Grant full access?'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.RuntimeAccessGrantList.confirmDescription',
                'The selected devices will be able to create worktrees, start sessions, send input, and run commands on this host.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {translate('auto.components.settings.RuntimeAccessGrantList.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void grantFullAccess()}
              disabled={grantingFullAccess}
            >
              {grantingFullAccess ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {translate(
                'auto.components.settings.RuntimeAccessGrantList.confirmGrant',
                'Grant full access'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
