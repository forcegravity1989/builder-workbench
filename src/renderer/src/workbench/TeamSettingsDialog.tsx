import { useEffect, useState } from 'react'
import { CircleHelp, Link2, LoaderCircle, Plus, RefreshCw, Save, UsersRound, X } from 'lucide-react'
import type { TeamDirectory } from '../../../shared/team-directory'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

type TeamSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TEAM_SPACE_STORAGE_KEY = 'bw:team-space-id:'
const TEAM_GROUP_STORAGE_KEY = 'bw:team-group-id'

function rememberedGroupId(): string {
  try {
    return window.localStorage.getItem(TEAM_GROUP_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberGroupId(groupId: string): void {
  try {
    window.localStorage.setItem(TEAM_GROUP_STORAGE_KEY, groupId)
  } catch {
    // The directory remains authoritative when browser storage is unavailable.
  }
}

function rememberedSpaceId(groupId: string): string {
  try {
    return window.localStorage.getItem(`${TEAM_SPACE_STORAGE_KEY}${groupId}`) ?? ''
  } catch {
    return ''
  }
}

function rememberSpaceId(groupId: string, spaceId: string): void {
  try {
    window.localStorage.setItem(`${TEAM_SPACE_STORAGE_KEY}${groupId}`, spaceId)
  } catch {
    // The directory remains authoritative when browser storage is unavailable.
  }
}

export function TeamSettingsDialog({ open, onOpenChange }: TeamSettingsDialogProps): React.JSX.Element {
  const [groupId, setGroupId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [directory, setDirectory] = useState<TeamDirectory | null>(null)
  const [directoryBase, setDirectoryBase] = useState<string | null>(null)
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingHostId, setGeneratingHostId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectRegisterOpen, setProjectRegisterOpen] = useState(false)
  const [spaceIdRequired, setSpaceIdRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const repos = useAppStore((state) => state.repos)
  const updateRepo = useAppStore((state) => state.updateRepo)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)

  const openSharingSettings = (): void => {
    onOpenChange(false)
    openSettingsTarget({ pane: 'servers', repoId: null })
    openSettingsPage()
  }

  useEffect(() => {
    if (!open) {
      setDirectory(null)
      setDirectoryBase(null)
      setCurrentMemberId(null)
      setSelectedProjectId('')
      setProjectRegisterOpen(false)
      setSpaceIdRequired(false)
      setError(null)
    }
  }, [open])

  const enterTeam = (): void => {
    setError(null)
    const nextGroupId = groupId.trim()
    const nextSpaceId = spaceId.trim() || rememberedSpaceId(nextGroupId)
    if (!nextGroupId) {
      setError('请填写群 ID。')
      return
    }
    if (!nextSpaceId) {
      setSpaceIdRequired(true)
      return
    }
    setSpaceIdRequired(false)
    setGroupId(nextGroupId)
    setSpaceId(nextSpaceId)
    rememberGroupId(nextGroupId)
    void loadDirectory(nextGroupId, nextSpaceId)
  }

  async function loadDirectory(
    requestedGroupId = groupId,
    requestedSpaceId = spaceId
  ): Promise<void> {
    const nextGroupId = requestedGroupId.trim()
    const nextSpaceId = requestedSpaceId.trim()
    if (!nextGroupId || !nextSpaceId) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.teamCollaboration.readDirectory({
        groupId: nextGroupId,
        spaceId: nextSpaceId
      })
      setDirectory(result.directory)
      setDirectoryBase(JSON.stringify(result.directory))
      setCurrentMemberId(result.currentMemberId)
      setGroupId(result.directory.team_group_id)
      setSpaceId(result.directory.team_space_id)
      rememberGroupId(result.directory.team_group_id)
      rememberSpaceId(result.directory.team_group_id, result.directory.team_space_id)
    } catch (cause) {
      if (!directory) {
        setSpaceIdRequired(true)
      }
      setError(cause instanceof Error ? cause.message : '读取团队目录失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || directory) {
      return
    }
    const rememberedGroup = rememberedGroupId()
    if (!rememberedGroup) {
      return
    }
    const rememberedSpace = rememberedSpaceId(rememberedGroup)
    setGroupId(rememberedGroup)
    setSpaceId(rememberedSpace)
    if (rememberedSpace) {
      void loadDirectory(rememberedGroup, rememberedSpace)
    }
  }, [open, directory])

  useEffect(() => {
    if (!open || !directory || !directoryBase || saving || generatingHostId || projectRegisterOpen) {
      return
    }
    if (JSON.stringify(directory) !== directoryBase) {
      return
    }
    const timer = window.setInterval(() => {
      void loadDirectory(groupId, spaceId)
    }, 30_000)
    return () => window.clearInterval(timer)
    // A directory refresh must not interrupt an in-progress local edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, directory, directoryBase, saving, generatingHostId, projectRegisterOpen, groupId, spaceId])

  const saveDirectory = async (): Promise<void> => {
    if (!directory || !directory.team_group_id || !directory.team_space_id) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.teamCollaboration.writeDirectory(directory)
      rememberGroupId(directory.team_group_id)
      rememberSpaceId(directory.team_group_id, directory.team_space_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步团队目录失败。')
    } finally {
      setSaving(false)
    }
  }

  const generateHostAddress = async (memberId: string): Promise<void> => {
    if (!directory?.team_group_id || currentMemberId !== memberId) {
      return
    }
    setGeneratingHostId(memberId)
    setError(null)
    try {
      const result = await window.api.mobile.getRuntimePairingUrl({
        // A fresh team-read link is the only link this host can safely mint.
        // The link is written to the team directory; this host must never
        // verify its own pairing code as a remote environment.
        rotate: true,
        reach: 'network',
        accessMode: 'team-read',
        teamBinding: { teamGroupId: directory.team_group_id, memberId }
      })
      if (!result.available) {
        throw new Error(result.guidance ?? '当前主机无法生成 Orca 共享地址。')
      }
      setDirectory((current) =>
        current
          ? {
              ...current,
              hosts: current.hosts.map((host) =>
                host.member_id === memberId
                  ? { ...host, host_id: result.deviceId, orca_endpoint: result.endpoint }
                  : host
              )
            }
          : current
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成 Orca 共享地址失败。')
    } finally {
      setGeneratingHostId(null)
    }
  }

  const registerProject = async (): Promise<void> => {
    if (!directory || !selectedProjectId) {
      return
    }
    const repo = repos.find((candidate) => candidate.id === selectedProjectId)
    const identity = repo?.gitRemoteIdentity
    if (!repo || !identity?.canonicalKey) {
      setError('请选择带有远端仓库身份的本机项目。')
      return
    }
    if (!currentMemberId || !directory.hosts.some((host) => host.member_id === currentMemberId)) {
      setError('未能确认当前 WeLink 成员身份，请重新读取团队目录后重试。')
      return
    }
    if (directory.projects.some((project) => project.repo_id === identity.canonicalKey)) {
      setError('这个项目已经登记在团队目录中。')
      return
    }
    setSaving(true)
    setError(null)
    const nextDirectory: TeamDirectory = {
      ...directory,
      projects: [
        ...directory.projects,
        {
          repo_id: identity.canonicalKey,
          name: repo.displayName,
          repository: identity.remoteUrl,
          sources: [currentMemberId]
        }
      ]
    }
    try {
      await window.api.teamCollaboration.writeDirectory(nextDirectory)
      const updated = await updateRepo(
        repo.id,
        { projectVisibility: 'team' },
        { hostId: repo.executionHostId ?? undefined }
      )
      if (!updated) {
        throw new Error('项目已写入群空间，但本机项目墙未能更新为团队项目。')
      }
      setDirectory(nextDirectory)
      setDirectoryBase(JSON.stringify(nextDirectory))
      setSelectedProjectId('')
      setProjectRegisterOpen(false)
      rememberGroupId(nextDirectory.team_group_id)
      rememberSpaceId(nextDirectory.team_group_id, nextDirectory.team_space_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登记团队项目失败。')
    } finally {
      setSaving(false)
    }
  }

  const availableProjects = directory
    ? repos.filter(
        (repo) =>
          getRepoExecutionHostId(repo) === 'local' &&
          Boolean(repo.gitRemoteIdentity?.canonicalKey) &&
          !directory.projects.some((project) => project.repo_id === repo.gitRemoteIdentity?.canonicalKey)
      )
    : []
  const memberName = (memberId: string): string =>
    directory?.hosts.find((host) => host.member_id === memberId)?.name ?? memberId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="size-4" /> 团队设置
          </DialogTitle>
          <DialogDescription>
            从 WeLink 群目录进入团队成员、主机和项目。
          </DialogDescription>
        </DialogHeader>
        {!directory ? (
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <span>WeLink 群 ID</span>
              <Input
                value={groupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value
                  setGroupId(nextGroupId)
                  setSpaceId(rememberedSpaceId(nextGroupId.trim()))
                }}
                inputMode="numeric"
              />
            </label>
            {spaceIdRequired ? (
              <label className="space-y-1 text-sm">
                <span>群空间 ID</span>
                <Input
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  inputMode="numeric"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">
                  首次使用需要提供群空间 ID；目录已有配置的成员无需重复填写。
                </span>
              </label>
            ) : null}
            <Button
              type="button"
              onClick={enterTeam}
              disabled={!groupId.trim() || (spaceIdRequired && !spaceId.trim()) || loading}
            >
              {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <UsersRound className="size-3.5" />}
              {spaceIdRequired ? '绑定团队' : '读取团队'}
            </Button>
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto scrollbar-sleek pr-1">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
              <label className="space-y-1 text-sm">
                <span>团队群 ID</span>
                <Input
                  value={groupId}
                  onChange={(event) => {
                    setGroupId(event.target.value)
                    setDirectory((current) => (current ? { ...current, team_group_id: event.target.value } : current))
                  }}
                  inputMode="numeric"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>群空间 ID</span>
                <Input
                  value={spaceId}
                  onChange={(event) => {
                    setSpaceId(event.target.value)
                    setDirectory((current) => (current ? { ...current, team_space_id: event.target.value } : current))
                  }}
                  inputMode="numeric"
                />
              </label>
            </div>
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
                    onClick={() => void loadDirectory()}
                    disabled={loading}
                    aria-label="刷新团队目录"
                  >
                    <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  </Button>
                </div>
              </div>
              {directory.hosts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">读取目录后显示成员与主机。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label="成员与主机">
                    <thead className="border-b border-border/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">成员</th>
                        <th className="px-3 py-2 font-medium">身份</th>
                        <th className="px-3 py-2 font-medium">主机与 Orca 地址</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directory.hosts.map((host) => {
                        const isCurrent = currentMemberId === host.member_id
                        const isLeader = /owner|leader/i.test(host.member_type ?? '')
                        return (
                          <tr key={host.member_id} className="border-b border-border/40 last:border-b-0">
                            <td className="px-3 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                  {(host.avatar ?? host.name ?? host.member_id).slice(0, 1)}
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-medium">{host.name ?? host.member_id}</span>
                                  <span className="block text-xs text-muted-foreground">{host.member_id}</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                {isCurrent ? '本机' : '非本机'}
                              </span>
                              {isLeader ? <span className="ml-1 text-xs text-muted-foreground">群主</span> : null}
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{host.name ?? host.member_id}的主机</span>
                                  <span className="text-xs text-muted-foreground">{host.host_id ?? '未登记'}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Input
                                    className="min-w-48 flex-1"
                                    aria-label={`${host.name ?? host.member_id} 的 Orca 地址`}
                                    value={host.orca_endpoint ?? ''}
                                    placeholder="Orca 共享地址"
                                    onChange={(event) => {
                                      const endpoint = event.target.value
                                      setDirectory((current) =>
                                        current
                                          ? {
                                              ...current,
                                              hosts: current.hosts.map((candidate) =>
                                                candidate.member_id === host.member_id
                                                  ? { ...candidate, orca_endpoint: endpoint || undefined }
                                                  : candidate
                                              )
                                            }
                                          : current
                                      )
                                    }}
                                  />
                                  {isCurrent ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void generateHostAddress(host.member_id)}
                                        disabled={generatingHostId !== null}
                                      >
                                        {generatingHostId === host.member_id ? (
                                          <LoaderCircle className="size-3.5 animate-spin" />
                                        ) : (
                                          <Link2 className="size-3.5" />
                                        )}
                                        {host.orca_endpoint ? '一键填入' : '一键生成并填入'}
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" onClick={openSharingSettings}>
                                        共享与授权
                                      </Button>
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
            <div className="rounded-lg border border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">团队项目</div>
                  <p className="text-xs text-muted-foreground">先登记项目，再按项目身份合并各成员项目墙来源。</p>
                </div>
                <div className="flex items-center gap-2">
                  {projectRegisterOpen ? (
                    <>
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger className="h-8 w-56 text-xs" aria-label="选择本机项目">
                          <SelectValue placeholder="选择本机项目" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProjects.map((repo) => (
                            <SelectItem key={repo.id} value={repo.id}>
                              {repo.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setProjectRegisterOpen(false)}>
                        取消
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setProjectRegisterOpen(true)}>
                      <Plus className="size-3.5" />
                      登记项目
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void loadDirectory()}
                    disabled={loading}
                    aria-label="刷新团队项目"
                  >
                    <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  </Button>
                  {projectRegisterOpen ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void registerProject()}
                      disabled={!selectedProjectId || saving || !currentMemberId}
                    >
                      {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                      添加
                    </Button>
                  ) : null}
                </div>
              </div>
              {directory.projects.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">还没有登记团队项目。</p>
              ) : (
                directory.projects.map((project) => (
                  <div key={project.repo_id} className="flex items-start justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                    <div className="min-w-0">
                      <div className="font-medium">{project.name ?? project.repo_id}</div>
                      <div className="truncate text-xs text-muted-foreground">{project.repository ?? project.repo_id}</div>
                      <div className="text-xs text-muted-foreground">
                        已从项目墙合并 · {project.sources.length > 0 ? project.sources.map(memberName).join('、') : '尚未读取来源'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">自动同步</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-end border-t border-border/60 pt-3">
              <Button type="button" onClick={() => void saveDirectory()} disabled={saving || !spaceId.trim()}>
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                同步到群空间
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        {error && !directory ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" variant="ghost" size="icon-sm" className="absolute top-4 right-4" onClick={() => onOpenChange(false)} aria-label="关闭团队设置">
          <X className="size-4" />
        </Button>
      </DialogContent>
    </Dialog>
  )
}
