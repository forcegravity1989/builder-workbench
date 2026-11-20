import { RefreshCw } from 'lucide-react'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult
} from '../../../../shared/runtime-access-grants'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { translate } from '@/i18n/i18n'

type RuntimeAccessAuditLogProps = {
  entries: RuntimeAccessAuditEntry[]
  isLoading: boolean
  action: string
  result: RuntimeAccessAuditResult | 'all'
  sinceDays: 1 | 7 | 14
  search: string
  onActionChange: (value: string) => void
  onResultChange: (value: RuntimeAccessAuditResult | 'all') => void
  onSinceDaysChange: (value: 1 | 7 | 14) => void
  onSearchChange: (value: string) => void
  onRefresh: () => void
}

export function RuntimeAccessAuditLog({
  entries,
  isLoading,
  action,
  result,
  sinceDays,
  search,
  onActionChange,
  onResultChange,
  onSinceDaysChange,
  onSearchChange,
  onRefresh
}: RuntimeAccessAuditLogProps): React.JSX.Element {
  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">
            {translate(
              'auto.components.settings.RuntimeAccessAuditLog.title',
              'Shared host access log'
            )}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.RuntimeAccessAuditLog.description',
              'Request metadata · last 14 days'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={translate(
            'auto.components.settings.RuntimeAccessAuditLog.refresh',
            'Refresh shared host access log'
          )}
        >
          <RefreshCw className={isLoading ? 'animate-spin' : undefined} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={action} onValueChange={onActionChange}>
          <SelectTrigger
            size="sm"
            aria-label={translate(
              'auto.components.settings.RuntimeAccessAuditLog.action',
              'Filter log action'
            )}
          >
            <SelectValue
              placeholder={translate(
                'auto.components.settings.RuntimeAccessAuditLog.allActions',
                'All actions'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate(
                'auto.components.settings.RuntimeAccessAuditLog.allActions',
                'All actions'
              )}
            </SelectItem>
            {[
              ...new Set([
                ...(action !== 'all' ? [action] : []),
                ...entries.map((entry) => entry.method)
              ])
            ].map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={result}
          onValueChange={(value) => onResultChange(value as RuntimeAccessAuditResult | 'all')}
        >
          <SelectTrigger
            size="sm"
            aria-label={translate(
              'auto.components.settings.RuntimeAccessAuditLog.result',
              'Filter log result'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate(
                'auto.components.settings.RuntimeAccessAuditLog.allResults',
                'All results'
              )}
            </SelectItem>
            <SelectItem value="allowed">
              {translate('auto.components.settings.RuntimeAccessAuditLog.allowed', 'Allowed')}
            </SelectItem>
            <SelectItem value="denied">
              {translate('auto.components.settings.RuntimeAccessAuditLog.denied', 'Denied')}
            </SelectItem>
            <SelectItem value="error">
              {translate('auto.components.settings.RuntimeAccessAuditLog.error', 'Error')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(sinceDays)}
          onValueChange={(value) => onSinceDaysChange(Number(value) as 1 | 7 | 14)}
        >
          <SelectTrigger
            size="sm"
            aria-label={translate(
              'auto.components.settings.RuntimeAccessAuditLog.time',
              'Filter log time'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">
              {translate('auto.components.settings.RuntimeAccessAuditLog.lastDay', 'Last 24 hours')}
            </SelectItem>
            <SelectItem value="7">
              {translate('auto.components.settings.RuntimeAccessAuditLog.lastWeek', 'Last 7 days')}
            </SelectItem>
            <SelectItem value="14">
              {translate(
                'auto.components.settings.RuntimeAccessAuditLog.lastTwoWeeks',
                'Last 14 days'
              )}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.RuntimeAccessAuditLog.search',
            'Search device or action'
          )}
          className="h-8 min-w-48 text-xs"
          aria-label={translate(
            'auto.components.settings.RuntimeAccessAuditLog.search',
            'Search device or action'
          )}
        />
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.RuntimeAccessAuditLog.empty',
            'No matching access records.'
          )}
        </p>
      ) : (
        <div className="max-h-64 overflow-auto scrollbar-sleek rounded-md border border-border/60">
          {entries.map((entry) => (
            <div
              key={`${entry.at}-${entry.requestId ?? entry.method}-${entry.deviceId}`}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{entry.method}</div>
                <div className="text-muted-foreground truncate">
                  {entry.deviceName ?? entry.deviceId} · {new Date(entry.at).toLocaleString()}
                </div>
              </div>
              <span
                className={
                  entry.result === 'allowed'
                    ? 'text-status-success'
                    : entry.result === 'denied'
                      ? 'text-muted-foreground'
                      : 'text-destructive'
                }
              >
                {entry.result === 'allowed'
                  ? translate('auto.components.settings.RuntimeAccessAuditLog.allowed', 'Allowed')
                  : entry.result === 'denied'
                    ? translate('auto.components.settings.RuntimeAccessAuditLog.denied', 'Denied')
                    : translate('auto.components.settings.RuntimeAccessAuditLog.error', 'Error')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
