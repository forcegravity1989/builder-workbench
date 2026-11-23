import { CircleHelp, Link2, LoaderCircle, RefreshCw, Settings } from 'lucide-react'
import type { TeamDirectoryMember } from '../../../shared/team-directory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type TeamSettingsMembersProps = {
  hosts: TeamDirectoryMember[]
  currentMemberId: string | null
  loading: boolean
  generatingHostId: string | null
  onRefresh: () => void
  onEndpointChange: (memberId: string, endpoint: string) => void
  onGenerateHostAddress: (memberId: string) => void
  onOpenSharingSettings: () => void
}

export function TeamSettingsMembers({
  hosts,
  currentMemberId,
  loading,
  generatingHostId,
  onRefresh,
  onEndpointChange,
  onGenerateHostAddress,
  onOpenSharingSettings
}: TeamSettingsMembersProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h3 className="text-sm font-medium">成员与主机</h3>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex size-7 items-center justify-center text-muted-foreground">
                <CircleHelp className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>成员来自 WeLink 群，主机地址来自 Orca 共享设置。</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="刷新团队目录"
          >
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
        </div>
      </div>
      {hosts.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">读取目录后显示成员与主机。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="成员与主机">
            <thead className="border-b border-border/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">成员</th>
                <th className="px-3 py-2 font-medium">主机与 Orca 地址</th>
              </tr>
            </thead>
            <tbody>
              {[...hosts]
                .sort((a, b) => {
                  const aLeader = /owner|leader/i.test(a.member_type ?? '')
                  const bLeader = /owner|leader/i.test(b.member_type ?? '')
                  return Number(bLeader) - Number(aLeader)
                })
                .map((host) => {
                  const isCurrent = currentMemberId === host.member_id
                  const isLeader = /owner|leader/i.test(host.member_type ?? '')
                  return (
                    <tr key={host.member_id} className="border-b border-border/40 last:border-b-0">
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          {host.avatar ? (
                            <img src={host.avatar} alt="" className="size-7 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                              {(host.name ?? host.member_id).slice(0, 1)}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-medium">
                              {host.name ?? host.member_id}
                              {isLeader ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">群主</span>
                              ) : null}
                              {isCurrent ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">本机</span>
                              ) : null}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-2">
                          <div className="font-medium" title={host.host_id ?? undefined}>
                            {host.name ?? host.member_id}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              className="min-w-56 flex-1"
                              aria-label={`${host.name ?? host.member_id} 的 Orca 地址`}
                              value={host.orca_endpoint ?? ''}
                              placeholder="Orca 共享地址"
                              onChange={(event) => onEndpointChange(host.member_id, event.target.value)}
                            />
                            {isCurrent ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => onGenerateHostAddress(host.member_id)}
                                      disabled={generatingHostId !== null}
                                      aria-label={
                                        host.orca_endpoint
                                          ? '一键填入 Orca 地址'
                                          : '一键生成并填入 Orca 地址'
                                      }
                                    >
                                      {generatingHostId === host.member_id ? (
                                        <LoaderCircle className="size-3.5 animate-spin" />
                                      ) : (
                                        <Link2 className="size-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {host.orca_endpoint ? '一键填入' : '一键生成并填入'}
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={onOpenSharingSettings}
                                      aria-label="共享与授权"
                                    >
                                      <Settings className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>共享与授权</TooltipContent>
                                </Tooltip>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
