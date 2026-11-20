import { RefreshCw, Trash2 } from 'lucide-react'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult
} from '../../../../shared/runtime-access-grants'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select'
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
  onClear: () => void
}

const AUDIT_METHOD_LABELS: Record<string, string> = {
  'connection.open': '建立共享连接',
  'connection.close': '断开共享连接',
  'access.grant.full': '授予完全访问',
  'access.revoke': '撤销访问',
  'workbench.review.receive': '接收评审通知',
  'repo.list': '读取项目目录',
  'projectGroup.list': '读取项目分组',
  'project.list': '读取项目',
  'projectHostSetup.list': '读取项目主机配置',
  'folderWorkspace.list': '读取工作区',
  'worktree.list': '读取工作树',
  'worktree.show': '读取工作树详情',
  'worktree.listRetiredNames': '读取已归档工作树名称',
  'files.read': '读取文件',
  'files.list': '读取文件列表',
  'files.search': '搜索文件',
  'files.searchPaths': '搜索文件路径',
  'git.status': '读取 Git 状态',
  'git.history': '读取 Git 历史',
  'terminal.read': '读取终端输出',
  'terminal.list': '读取终端列表',
  'codehub.mrForBranch': '读取 CodeHub 合并请求',
  'codehub.listTasks': '读取 CodeHub 任务列表',
  'codehub.listLabels': '读取 CodeHub 标签',
  'codehub.listMembers': '读取 CodeHub 成员',
  'codehub.listPipelines': '读取 CodeHub 流水线',
  'codehub.viewTask': '读取 CodeHub 任务',
  'codehub.mrChecks': '读取 CodeHub 检查',
  'github.workItem': '读取 GitHub 工作项',
  'github.workItemDetails': '读取 GitHub 工作项详情',
  'github.prComments': '读取 PR 评论',
  'github.prChecks': '读取 PR 检查',
  'github.prFileContents': '读取 PR 文件',
  'github.repoSlug': '读取 GitHub 仓库信息',
  'github.repoUpstream': '读取 GitHub 上游仓库',
  'github.rateLimit': '读取 GitHub 速率限制',
  'github.listWorkItems': '读取 GitHub 工作项列表',
  'github.listIssues': '读取 GitHub Issue 列表',
  'github.countWorkItems': '读取 GitHub 工作项数量',
  'github.listLabels': '读取 GitHub 标签',
  'github.listAssignableUsers': '读取 GitHub可分配成员',
  'github.project.listAccessible': '读取 GitHub 项目列表',
  'github.project.listLabelsBySlug': '读取 GitHub 项目标签',
  'github.project.listAssignableUsersBySlug': '读取 GitHub 项目成员',
  'github.project.listIssueTypesBySlug': '读取 GitHub 项目类型',
  'github.project.resolveRef': '读取 GitHub 项目引用',
  'github.project.listViews': '读取 GitHub 项目视图',
  'github.project.viewTable': '读取 GitHub 项目表格',
  'files.readTerminalArtifact': '读取终端产物',
  'files.readTerminalArtifactPreview': '读取终端产物预览',
  'preflight.check': '读取主机预检状态',
  'preflight.detectAgents': '读取可用 Agent',
  'terminal.resolveActive': '读取活动终端',
  'terminal.resolvePane': '读取终端面板',
  'terminal.resolveIdentity': '读取终端身份',
  'terminal.inspectProcess': '读取终端进程',
  'terminal.agentStatus': '读取终端 Agent 状态',
  'workbench.review.comments': '读取评审评论'
}

function auditMethodLabel(method: string): string {
  return AUDIT_METHOD_LABELS[method] ?? `其他操作（${method}）`
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
  onRefresh,
  onClear
}: RuntimeAccessAuditLogProps): React.JSX.Element {
  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">
            {translate('auto.components.settings.RuntimeAccessAuditLog.title', 'Shared host access log')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.RuntimeAccessAuditLog.description',
              'Request metadata · last 14 days'
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isLoading || entries.length === 0}
          >
            <Trash2 className="size-3.5" />
            {translate('auto.components.settings.RuntimeAccessAuditLog.clear', '清理日志')}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={action} onValueChange={onActionChange}>
          <SelectTrigger size="sm" aria-label={translate('auto.components.settings.RuntimeAccessAuditLog.action', 'Filter log action')}>
            <SelectValue placeholder={translate('auto.components.settings.RuntimeAccessAuditLog.allActions', 'All actions')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate('auto.components.settings.RuntimeAccessAuditLog.allActions', 'All actions')}</SelectItem>
            {[...new Set([...(action !== 'all' ? [action] : []), ...entries.map((entry) => entry.method)])].map((method) => (
              <SelectItem key={method} value={method}>{auditMethodLabel(method)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={(value) => onResultChange(value as RuntimeAccessAuditResult | 'all')}>
          <SelectTrigger size="sm" aria-label={translate('auto.components.settings.RuntimeAccessAuditLog.result', 'Filter log result')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate('auto.components.settings.RuntimeAccessAuditLog.allResults', 'All results')}</SelectItem>
            <SelectItem value="allowed">{translate('auto.components.settings.RuntimeAccessAuditLog.allowed', 'Allowed')}</SelectItem>
            <SelectItem value="denied">{translate('auto.components.settings.RuntimeAccessAuditLog.denied', 'Denied')}</SelectItem>
            <SelectItem value="error">{translate('auto.components.settings.RuntimeAccessAuditLog.error', 'Error')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(sinceDays)} onValueChange={(value) => onSinceDaysChange(Number(value) as 1 | 7 | 14)}>
          <SelectTrigger size="sm" aria-label={translate('auto.components.settings.RuntimeAccessAuditLog.time', 'Filter log time')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{translate('auto.components.settings.RuntimeAccessAuditLog.lastDay', 'Last 24 hours')}</SelectItem>
            <SelectItem value="7">{translate('auto.components.settings.RuntimeAccessAuditLog.lastWeek', 'Last 7 days')}</SelectItem>
            <SelectItem value="14">{translate('auto.components.settings.RuntimeAccessAuditLog.lastTwoWeeks', 'Last 14 days')}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={translate('auto.components.settings.RuntimeAccessAuditLog.search', 'Search device or action')}
          className="h-8 min-w-48 text-xs"
          aria-label={translate('auto.components.settings.RuntimeAccessAuditLog.search', 'Search device or action')}
        />
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {translate('auto.components.settings.RuntimeAccessAuditLog.empty', 'No matching access records.')}
        </p>
      ) : (
        <div className="max-h-64 overflow-auto scrollbar-sleek rounded-md border border-border/60">
          {entries.map((entry) => (
            <div
              key={`${entry.at}-${entry.requestId ?? entry.method}-${entry.deviceId}`}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{auditMethodLabel(entry.method)}</div>
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
