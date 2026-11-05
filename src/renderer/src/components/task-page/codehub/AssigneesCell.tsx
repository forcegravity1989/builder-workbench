import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { codehubApi } from '@/lib/codehub-api'
import { toast } from 'sonner'
import type { CodeHubProjectMember } from '../../../../../shared/codehub-api'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'
import type { Repo } from '../../../../../shared/repo-types'

/**
 * 任务列表行的负责人单元格。CLI `issue update --assignee` 是单值替换语义
 * （无 add/remove、无清除），所以点选成员即把负责人替换为该成员，成功后
 * 收起下拉；已是唯一负责人的成员再点只收起、不重复请求；不提供移除入口
 * ——如实反映 CLI 单值能力。owner 把读写钉在仓库所属执行主机上，跨主机
 * 重复 id 不会错路由。
 */
export function CodeHubAssigneesCell({
  item,
  owner,
  onChanged
}: {
  item: CodeHubTaskItem
  owner?: Repo
  onChanged: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<CodeHubProjectMember[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingUsername, setPendingUsername] = useState<string | null>(null)
  // 候选名单在 popover 打开时拉取（重开重拉），与详情页标签选择器一致。
  useEffect(() => {
    if (!open || !item.repoPath || (item.executionHostId && !owner)) {
      return
    }
    let stale = false
    setLoading(true)
    setError(null)
    codehubApi
      .listMembers({ repoPath: item.repoPath, repoId: item.repoId }, owner ?? undefined)
      .then((list) => {
        if (!stale) {
          setMembers(list)
        }
      })
      .catch((reason: unknown) => {
        if (!stale) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setMembers(null)
        }
      })
      .finally(() => {
        if (!stale) {
          setLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [open, owner, item.repoPath, item.repoId, item.executionHostId])

  const assign = useCallback(
    async (member: CodeHubProjectMember): Promise<void> => {
      if (!item.repoPath || (item.executionHostId && !owner) || pendingUsername) {
        return
      }
      const username = member.username.toLowerCase()
      if (item.assignees.length === 1 && item.assignees[0]!.toLowerCase() === username) {
        // Why: 已是唯一负责人，指派是空操作；收起下拉让人看到操作已完成。
        setOpen(false)
        return
      }
      setPendingUsername(member.username)
      try {
        await codehubApi.assignIssue(
          {
            repoPath: item.repoPath,
            repoId: item.repoId,
            iid: item.iid,
            assignee: member.username
          },
          owner ?? undefined
        )
        toast.success(translate('auto.components.TaskPage.codehubAssigned', 'Assignee updated'))
        // Why: 单值替换选完即达成目的，保持展开只会让人再手动关一次。
        setOpen(false)
        onChanged()
      } catch (reason: unknown) {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setPendingUsername(null)
      }
    },
    [
      item.assignees,
      item.executionHostId,
      item.iid,
      item.repoId,
      item.repoPath,
      owner,
      onChanged,
      pendingUsername
    ]
  )

  const assigneeNames = item.assignees.join(', ')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            assigneeNames
              ? translate('auto.components.TaskPage.bb63046423', 'Assigned to {{value0}}', {
                  value0: assigneeNames
                })
              : translate('auto.components.TaskPage.7f94eb6395', 'Assign issue')
          }
          aria-busy={pendingUsername !== null}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex h-6 min-w-0 max-w-full items-center gap-1 truncate rounded-sm border border-transparent px-1 text-left text-[12px] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <span className="min-w-0 truncate">{assigneeNames || '—'}</span>
          {pendingUsername ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin" />
          ) : (
            <ChevronDown className="size-3 shrink-0 opacity-0 transition group-hover/github-task-row:opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="popover-scroll-content scrollbar-sleek w-64 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        {!item.repoPath ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.53e002d895', 'Issue has no repo slug.')}
          </div>
        ) : loading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.0eacf48491', 'Loading…')}
          </div>
        ) : error ? (
          <div className="px-2 py-2 text-xs text-destructive">{error}</div>
        ) : (members ?? []).length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.codehubNoMembers', 'No project members found.')}
          </div>
        ) : (
          (members ?? []).map((member) => {
            const isOn = item.assignees.some(
              (name) => name.toLowerCase() === member.username.toLowerCase()
            )
            const pending = pendingUsername === member.username
            return (
              <button
                key={member.username}
                type="button"
                aria-pressed={isOn}
                disabled={pendingUsername !== null}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-60',
                  isOn && 'bg-accent/50'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  void assign(member)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {member.nameCn ?? member.name ?? member.username}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {member.username}
                  </span>
                </span>
                {pending ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                ) : isOn ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : null}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
