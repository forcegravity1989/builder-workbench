import { RefreshCw } from 'lucide-react'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult
} from '../../../../shared/runtime-access-grants'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

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
          <h3 className="text-sm font-medium">Shared host access log</h3>
          <p className="text-muted-foreground text-xs">Request metadata · last 14 days</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh shared host access log"
        >
          <RefreshCw className={isLoading ? 'animate-spin' : undefined} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={action}
          onChange={(event) => onActionChange(event.target.value)}
          className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter log action"
        >
          <option value="all">All actions</option>
          {[...new Set(entries.map((entry) => entry.method))].map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <select
          value={result}
          onChange={(event) =>
            onResultChange(event.target.value as RuntimeAccessAuditResult | 'all')
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter log result"
        >
          <option value="all">All results</option>
          <option value="allowed">Allowed</option>
          <option value="denied">Denied</option>
          <option value="error">Error</option>
        </select>
        <select
          value={sinceDays}
          onChange={(event) => onSinceDaysChange(Number(event.target.value) as 1 | 7 | 14)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter log time"
        >
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
        </select>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search device or action"
          className="h-8 min-w-48 text-xs"
          aria-label="Search shared host access log"
        />
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">No matching access records.</p>
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
                    ? 'text-emerald-600'
                    : entry.result === 'denied'
                      ? 'text-amber-600'
                      : 'text-destructive'
                }
              >
                {entry.result}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
