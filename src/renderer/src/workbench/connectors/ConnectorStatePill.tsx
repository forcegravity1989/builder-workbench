import { cn } from '@/lib/utils'
import type { ConnectorAgentRow } from '../../../../shared/workbench/connector-status'
import type { ConnectorAgent, ConnectorState } from '../../../../shared/workbench/connectors'

export const AGENT_LABEL: Record<ConnectorAgent, string> = {
  claude: 'Claude Code',
  codex: 'Codex'
}

const STATE_LABEL: Record<ConnectorState, string> = {
  connected: '已连接',
  'needs-auth': '要登录',
  failed: '连不上',
  'pending-approval': '待批准',
  'logged-in': '已登录',
  'no-auth': '无需登录',
  disabled: '已停用',
  unknown: '未检测'
}

// 只有 Claude Code 实测连通的才是绿色；Codex 的「已登录 / 无需登录」是配置态，保持中性。
const STATE_TONE: Record<ConnectorState, string> = {
  connected: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'needs-auth': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'pending-approval': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
  'logged-in': 'border-border bg-background text-foreground',
  'no-auth': 'border-border bg-background text-foreground',
  disabled: 'border-border bg-muted/60 text-muted-foreground',
  unknown: 'border-border bg-muted/60 text-muted-foreground'
}

export function ConnectorStatePill({
  agent,
  row
}: {
  agent: ConnectorAgent
  row: ConnectorAgentRow
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium',
        STATE_TONE[row.state]
      )}
      title={row.detail}
    >
      {AGENT_LABEL[agent]} · {STATE_LABEL[row.state]}
    </span>
  )
}
