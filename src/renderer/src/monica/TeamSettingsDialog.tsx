import { useEffect, useState } from 'react'
import { Link2, LoaderCircle, Plus, RefreshCw, Save, UsersRound, X } from 'lucide-react'
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
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

type TeamSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TEAM_SPACE_STORAGE_KEY = 'bw:team-space-id:'

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

export function TeamSettingsDialog({
  open,
  onOpenChange
}: TeamSettingsDialogProps): React.JSX.Element {
  const [groupId, setGroupId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [directory, setDirectory] = useState<TeamDirectory | null>(null)
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingHostId, setGeneratingHostId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const repos = useAppStore((state) => state.repos)
  const updateRepo = useAppStore((state) => state.updateRepo)
  const setRuntimeEnvironments = useAppStore((state) => state.setRuntimeEnvironments)
  const readRuntimeHostStatusSnapshots = useAppStore(
    (state) => state.readRuntimeHostStatusSnapshots
  )

  useEffect(() => {
    if (!open) {
      setGroupId('')
      setSpaceId('')
      setDirectory(null)
      setCurrentMemberId(null)
      setSelectedProjectId('')
      setError(null)
    }
  }, [open])

  const enterTeam = (): void => {
    setError(null)
    const nextGroupId = groupId.trim()
    const nextSpaceId = spaceId.trim() || rememberedSpaceId(nextGroupId)
    if (!nextGroupId || !nextSpaceId) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setGroupId(nextGroupId)
    setSpaceId(nextSpaceId)
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
      setCurrentMemberId(result.currentMemberId)
      setGroupId(result.directory.team_group_id)
      setSpaceId(result.directory.team_space_id)
      rememberSpaceId(result.directory.team_group_id, result.directory.team_space_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取团队目录失败。')
    } finally {
      setLoading(false)
    }
  }

  const saveDirectory = async (): Promise<void> => {
    if (!directory || !directory.team_group_id || !directory.team_space_id) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.teamCollaboration.writeDirectory(directory)
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
        rotate: true,
        reach: 'network',
        accessMode: 'team-read',
        teamBinding: { teamGroupId: directory.team_group_id, memberId }
      })
      if (!result.available) {
        throw new Error(result.guidance ?? '当前主机无法生成 Orca 共享地址。')
      }
      const registration = await window.api.runtimeEnvironments.verifyAndAddFromPairingCode({
        name: directory.hosts.find((host) => host.member_id === memberId)?.name ?? memberId,
        pairingCode: result.pairingUrl,
        allowLoopback: false
      })
      if (!registration.ok) {
        throw new Error(registration.message)
      }
      setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      await readRuntimeHostStatusSnapshots()
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
      setSelectedProjectId('')
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
          !directory.projects.some(
            (project) => project.repo_id === repo.gitRemoteIdentity?.canonicalKey
          )
      )
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="size-4" /> 团队设置
          </DialogTitle>
          <DialogDescription>输入群 ID 和群空间 ID 后管理团队成员、主机和项目。</DialogDescription>
        </DialogHeader>
        {!directory ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span>WeLink 群 ID</span>
                <Input
                  value={groupId}
                  onChange={(event) => {
                    const nextGroupId = event.target.value
                    setGroupId(nextGroupId)
                    if (!spaceId.trim()) {
                      setSpaceId(rememberedSpaceId(nextGroupId.trim()))
                    }
                  }}
                  inputMode="numeric"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>群空间 ID</span>
                <Input
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
            <Button
              type="button"
              onClick={enterTeam}
              disabled={!groupId.trim() || !spaceId.trim() || loading}
            >
              {loading ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <UsersRound className="size-3.5" />
              )}
              绑定团队
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
                    setDirectory((current) =>
                      current ? { ...current, team_group_id: event.target.value } : current
                    )
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
                    setDirectory((current) =>
                      current ? { ...current, team_space_id: event.target.value } : current
                    )
                  }}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadDirectory()}
                disabled={loading}
              >
                {loading ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                读取群空间目录
              </Button>
              <Button
                type="button"
                onClick={() => void saveDirectory()}
                disabled={saving || !spaceId.trim()}
              >
                {saving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                同步到群空间
              </Button>
            </div>
            <div className="rounded-lg border border-border/60">
              <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
                成员与主机
              </div>
              {directory.hosts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  读取目录后显示成员与主机。
                </p>
              ) : (
                directory.hosts.map((host) => (
                  <div
                    key={host.member_id}
                    className="flex items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="w-32 shrink-0">{host.name ?? host.member_id}</span>
                    <Input
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
                    {currentMemberId === host.member_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="生成并填入本机 Orca 地址"
                        aria-label="生成并填入本机 Orca 地址"
                        onClick={() => void generateHostAddress(host.member_id)}
                        disabled={generatingHostId !== null}
                      >
                        {generatingHostId === host.member_id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Link2 className="size-3.5" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="rounded-lg border border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <div className="text-sm font-medium">团队项目</div>
                <div className="flex items-center gap-2">
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void registerProject()}
                    disabled={!selectedProjectId || saving || !currentMemberId}
                  >
                    {saving ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    登记项目
                  </Button>
                </div>
              </div>
              {directory.projects.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">还没有登记团队项目。</p>
              ) : (
                directory.projects.map((project) => (
                  <div
                    key={project.repo_id}
                    className="border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="font-medium">{project.name ?? project.repo_id}</div>
                    <div className="text-muted-foreground">
                      {project.sources.length > 0
                        ? `来源 ${project.sources.join('、')}`
                        : '来源由各主机同步'}
                    </div>
                  </div>
                ))
              )}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        {error && !directory ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
          onClick={() => onOpenChange(false)}
          aria-label="关闭团队设置"
        >
          <X className="size-4" />
        </Button>
      </DialogContent>
    </Dialog>
  )
}
