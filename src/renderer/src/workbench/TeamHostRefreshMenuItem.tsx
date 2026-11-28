import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { hasTeamBinding, syncTeamHosts } from './team-hosts'

/** Remote host menu entry that re-reads the team directory; hidden until a team is bound. */
export function TeamHostRefreshMenuItem(): React.JSX.Element | null {
  if (!hasTeamBinding()) {
    return null
  }
  const refresh = async (): Promise<void> => {
    try {
      const result = await syncTeamHosts()
      if (result?.failed) {
        toast.warning(
          `有 ${result.failed} 位成员的主机未能同步。请在「管理远程主机」核对现有记录后重试。`
        )
        return
      }
      const changed = (result?.added ?? 0) + (result?.updated ?? 0)
      toast.success(
        changed > 0
          ? `团队主机已更新：新增 ${result?.added ?? 0} 台，刷新 ${result?.updated ?? 0} 台。`
          : '团队主机已是最新。'
      )
    } catch (cause) {
      // The IPC wrapper text ("Error invoking remote method") is internal; keep it out of the toast.
      console.error('[team] refresh hosts failed', cause)
      toast.error('刷新团队主机失败：请确认已登录 WeLink 且网络可用，然后重试。')
    }
  }
  return <DropdownMenuItem onSelect={() => void refresh()}>刷新团队主机</DropdownMenuItem>
}
