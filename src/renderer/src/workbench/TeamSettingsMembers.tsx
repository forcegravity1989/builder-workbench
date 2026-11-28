import { useState } from 'react'
import { Link2, LoaderCircle, RefreshCw } from 'lucide-react'
import type { TeamDirectoryMember } from '../../../shared/team-directory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type TeamSettingsMembersProps = {
  hosts: TeamDirectoryMember[]
  currentMemberId: string | null
  loading: boolean
  disabled: boolean
  generatingHostId: string | null
  onRefresh: () => void
  onEndpointChange: (memberId: string, endpoint: string) => void
  onGenerateHostAddress: (memberId: string) => void
}

function isLeaderMember(member: TeamDirectoryMember): boolean {
  return /owner|leader/i.test(member.member_type ?? '')
}

function MemberAvatar({ member }: { member: TeamDirectoryMember }): React.JSX.Element {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const label = member.name ?? member.member_id
  if (member.avatar && failedSource !== member.avatar) {
    return (
      <img
        src={member.avatar}
        alt={`${label}头像`}
        className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
        onError={() => setFailedSource(member.avatar ?? null)}
      />
    )
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium ring-1 ring-border">
      {label.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function TeamSettingsMembers({
  hosts,
  currentMemberId,
  loading,
  disabled,
  generatingHostId,
  onRefresh,
  onEndpointChange,
  onGenerateHostAddress
}: TeamSettingsMembersProps): React.JSX.Element {
  const orderedHosts = [...hosts].sort(
    (a, b) => Number(isLeaderMember(b)) - Number(isLeaderMember(a))
  )
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">成员与主机</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={disabled}
              aria-label="刷新当前团队目录"
            >
              <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            刷新当前团队目录
          </TooltipContent>
        </Tooltip>
      </div>
      {orderedHosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">读取目录后显示成员与主机。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm" aria-label="成员与主机">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-[190px] px-2 py-2 font-medium">成员</th>
                <th className="px-2 py-2 font-medium">主机与 Orca 地址</th>
              </tr>
            </thead>
            <tbody>
              {orderedHosts.map((host) => {
                const isCurrent = currentMemberId === host.member_id
                const displayName = host.name ?? host.member_id
                return (
                  <tr key={host.member_id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-2 py-2.5 align-top">
                      <div className="flex items-center gap-2.5" title={host.member_id}>
                        <MemberAvatar member={host} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold">{displayName}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {isLeaderMember(host) ? '群主' : '成员'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <div title={host.host_id ?? undefined}>
                        <div className="flex items-center gap-1.5">
                          <Input
                            className="min-w-0 flex-1"
                            aria-label={`${displayName} 的 Orca 地址`}
                            value={host.orca_endpoint ?? ''}
                            placeholder="Orca 共享地址"
                            readOnly={!isCurrent || disabled}
                            onChange={(event) =>
                              onEndpointChange(host.member_id, event.target.value)
                            }
                          />
                          {isCurrent ? (
                            <span className="flex shrink-0 items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => onGenerateHostAddress(host.member_id)}
                                    disabled={disabled}
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
                            </span>
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
    </section>
  )
}
