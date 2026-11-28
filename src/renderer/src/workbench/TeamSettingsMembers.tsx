import { useState } from 'react'
import { Link2, LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { TeamDirectoryMember } from '../../../shared/team-directory'
import { isTailnetIPv4Address } from '../../../shared/network/tailnet-address'
import { isOfficeIPv4Address } from '../../../shared/team-host-address'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openMonicaSupport } from './improvement/open-monica-support'

export type TeamNetworkInterface = { name: string; address: string }

type TeamSettingsMembersProps = {
  hosts: TeamDirectoryMember[]
  currentMemberId: string | null
  loading: boolean
  disabled: boolean
  generatingHostId: string | null
  networkInterfaces: TeamNetworkInterface[]
  selectedAddress: string
  onSelectedAddressChange: (address: string) => void
  onRefresh: () => void
  onEndpointChange: (memberId: string, endpoint: string) => void
  onGenerateHostAddress: (memberId: string) => void
}

function segmentLabel(networkInterface: TeamNetworkInterface): string {
  if (isOfficeIPv4Address(networkInterface.address)) {
    return `办公网 ${networkInterface.address}（${networkInterface.name}）`
  }
  if (isTailnetIPv4Address(networkInterface.address)) {
    return `Tailscale ${networkInterface.address}`
  }
  return `${networkInterface.address}（${networkInterface.name}）`
}

function officeAddressHint(address: string, interfaceCount: number): string {
  if (!address) {
    return interfaceCount > 0
      ? '先选中办公网 10 网段再生成，然后保存到群空间。卡住时'
      : '没有读到可用网卡。检查网络后重试，仍不行就'
  }
  if (isOfficeIPv4Address(address)) {
    return interfaceCount > 1
      ? `已选办公网 ${address}。生成后保存到群空间。要换网卡，先改选网段。卡住时`
      : `将用办公网 ${address} 生成。生成后保存到群空间。卡住时`
  }
  return interfaceCount > 1
    ? `当前 ${address} 不是办公网 10 网段。选中 10 网段再生成，然后保存到群空间。卡住时`
    : `当前只有 ${address}，不是办公网 10 网段。生成后保存到群空间。地址不对就`
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
  networkInterfaces,
  selectedAddress,
  onSelectedAddressChange,
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
                          {isCurrent && selectedAddress && networkInterfaces.length > 1 ? (
                            <Select
                              value={selectedAddress}
                              onValueChange={onSelectedAddressChange}
                              disabled={disabled || !selectedAddress}
                            >
                              <SelectTrigger
                                className="h-8 w-52 shrink-0 text-xs"
                                aria-label="生成地址使用的网段"
                              >
                                <SelectValue placeholder="选择网段" />
                              </SelectTrigger>
                              <SelectContent>
                                {networkInterfaces.map((networkInterface) => (
                                  <SelectItem
                                    key={networkInterface.address}
                                    value={networkInterface.address}
                                  >
                                    {segmentLabel(networkInterface)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
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
                        {isCurrent ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {officeAddressHint(selectedAddress, networkInterfaces.length)}
                            <button
                              type="button"
                              className="ml-1 text-foreground underline underline-offset-2"
                              onClick={() => {
                                void openMonicaSupport()
                                  .then((warning) => {
                                    if (warning) {
                                      toast.warning(warning)
                                    }
                                  })
                                  .catch((error: unknown) => {
                                    toast.error('无法打开 Monica', {
                                      description:
                                        error instanceof Error ? error.message : undefined
                                    })
                                  })
                              }}
                            >
                              问 Monica
                            </button>
                            。
                          </p>
                        ) : null}
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
