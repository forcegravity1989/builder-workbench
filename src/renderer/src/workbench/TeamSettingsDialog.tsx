import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, RefreshCw, Save, UsersRound, X } from 'lucide-react'
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
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
import { TeamSettingsMembers } from './TeamSettingsMembers'

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
    // The loader is intentionally stable for this open-session bootstrap; rerunning
    // it for every renderer callback would issue duplicate OneBox reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, directory])

  useEffect(() => {
    if (!open || !directory || !directoryBase || saving || projectRegisterOpen) {
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
  }, [open, directory, directoryBase, saving, projectRegisterOpen, groupId, spaceId])

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
    const alreadyRegistered = directory.projects.some(
      (project) => project.repo_id === identity.canonicalKey
    )
    setSaving(true)
    setError(null)
    const nextDirectory: TeamDirectory = alreadyRegistered
      ? directory
      : {
          ...directory,
          projects: [
            ...directory.projects,
            {
              repo_id: identity.canonicalKey,
              name: repo.displayName,
              repository: identity.remoteUrl
            }
          ]
        }
    try {
      if (!alreadyRegistered) {
        await window.api.teamCollaboration.writeDirectory(nextDirectory)
      }
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
          repo.projectVisibility !== 'team'
      )
    : []
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
            <TeamSettingsMembers
              hosts={directory.hosts}
              currentMemberId={currentMemberId}
              loading={loading}

              onRefresh={() => void loadDirectory()}
              onEndpointChange={(memberId, endpoint) => {
                setDirectory((current) =>
                  current
                    ? {
                        ...current,
                        hosts: current.hosts.map((candidate) =>
                          candidate.member_id === memberId
                            ? { ...candidate, orca_endpoint: endpoint || undefined }
                            : candidate
                        )
                      }
                    : current
                )
              }}

              onOpenSharingSettings={openSharingSettings}
            />
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
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-end border-t border-border/60 pt-3">
              <Button type="button" onClick={() => void saveDirectory()} disabled={saving || !spaceId.trim()}>
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                保存到群空间
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
