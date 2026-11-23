import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Plus, Save, UsersRound, X } from 'lucide-react'
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
import { TeamSettingsMembers } from './TeamSettingsMembers'
import { rememberedTeamBinding, rememberTeamBinding, syncTeamHosts } from './team-hosts'

type TeamSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Last directory read in this renderer session, shown immediately on reopen while a fresh read runs.
let directorySnapshot: {
  directory: TeamDirectory
  fileId: string | null
  currentMemberId: string | null
} | null = null

export function TeamSettingsDialog({
  open,
  onOpenChange
}: TeamSettingsDialogProps): React.JSX.Element {
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
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const repos = useAppStore((state) => state.repos)
  const updateRepo = useAppStore((state) => state.updateRepo)
  const directoryRef = useRef<TeamDirectory | null>(null)
  const directoryBaseRef = useRef<string | null>(null)
  // The team.json the visible draft was read from; saving refuses to overwrite a newer one.
  const directoryFileIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    directoryRef.current = directory
    directoryBaseRef.current = directoryBase
  }, [directory, directoryBase])

  useEffect(() => {
    if (!open) {
      setDirectory(null)
      setDirectoryBase(null)
      setCurrentMemberId(null)
      setSelectedProjectId('')
      setProjectRegisterOpen(false)
      setFilePreviewOpen(false)
      setError(null)
    }
  }, [open])

  const enterTeam = (): void => {
    setError(null)
    void loadDirectory(groupId, spaceId).then(() => syncTeamHosts().catch(() => undefined))
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
      directorySnapshot = {
        directory: result.directory,
        fileId: result.fileId,
        currentMemberId: result.currentMemberId
      }
      const editedLocally =
        directoryRef.current !== null &&
        JSON.stringify(directoryRef.current) !== directoryBaseRef.current
      if (!editedLocally) {
        setDirectory(result.directory)
        setDirectoryBase(JSON.stringify(result.directory))
        directoryFileIdRef.current = result.fileId
      }
      setCurrentMemberId(result.currentMemberId)
      setGroupId(result.directory.team_group_id)
      setSpaceId(result.directory.team_space_id)
      rememberTeamBinding(result.directory.team_group_id, result.directory.team_space_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取团队目录失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || directory) {
      return
    }
    const binding = rememberedTeamBinding()
    setGroupId(binding.groupId)
    setSpaceId(binding.spaceId)
    if (binding.groupId && binding.spaceId) {
      if (
        directorySnapshot?.directory.team_group_id === binding.groupId &&
        directorySnapshot.directory.team_space_id === binding.spaceId
      ) {
        setDirectory(directorySnapshot.directory)
        setDirectoryBase(JSON.stringify(directorySnapshot.directory))
        directoryFileIdRef.current = directorySnapshot.fileId
        setCurrentMemberId(directorySnapshot.currentMemberId)
      }
      // Sequential: both read the same OneBox files, which throttles back-to-back calls.
      void loadDirectory(binding.groupId, binding.spaceId).then(() =>
        syncTeamHosts().catch(() => undefined)
      )
    }
    // The loader is intentionally stable for this open-session bootstrap; rerunning
    // it for every renderer callback would issue duplicate OneBox reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, directory])

  useEffect(() => {
    if (
      !open ||
      !directory ||
      !directoryBase ||
      saving ||
      generatingHostId ||
      projectRegisterOpen
    ) {
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
  }, [
    open,
    directory,
    directoryBase,
    saving,
    generatingHostId,
    projectRegisterOpen,
    groupId,
    spaceId
  ])

  const saveDirectory = async (): Promise<void> => {
    if (!directory || !directory.team_group_id || !directory.team_space_id) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const written = await window.api.teamCollaboration.writeDirectory(
        directory,
        directoryFileIdRef.current
      )
      directoryFileIdRef.current = written.fileId
      setDirectoryBase(JSON.stringify(directory))
      rememberTeamBinding(directory.team_group_id, directory.team_space_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步团队目录失败。')
    } finally {
      setSaving(false)
    }
  }

  const generateHostAddress = async (memberId: string): Promise<void> => {
    const host = directory?.hosts.find((candidate) => candidate.member_id === memberId)
    if (!directory?.team_group_id || currentMemberId !== memberId || !host) {
      return
    }
    setGeneratingHostId(memberId)
    setError(null)
    try {
      const result = await window.api.mobile.getRuntimePairingUrl({
        // A fresh team-read link is the only link this host can safely mint.
        // The link is written to the team directory; this host must never
        // verify its own pairing code as a remote environment.
        rotate: false,
        reach: 'network',
        accessMode: 'team-read',
        teamBinding: { teamGroupId: directory.team_group_id, memberId },
        name: host.name ?? memberId,
        ...(host.avatar ? { avatar: host.avatar } : {})
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
                  ? { ...host, host_id: result.deviceId, orca_endpoint: result.pairingUrl }
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
        const written = await window.api.teamCollaboration.writeDirectory(
          nextDirectory,
          directoryFileIdRef.current
        )
        directoryFileIdRef.current = written.fileId
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
      rememberTeamBinding(nextDirectory.team_group_id, nextDirectory.team_space_id)
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
  const savedBinding = rememberedTeamBinding()
  const checkingBinding =
    !directory && !error && Boolean(savedBinding.groupId && savedBinding.spaceId)
  const showSpinner = !directory && (loading || checkingBinding)
  const showDirectoryChrome = Boolean(directory) || checkingBinding
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={showDirectoryChrome ? 'gap-3 sm:max-w-[920px]' : 'sm:max-w-[520px]'}
      >
        {showDirectoryChrome ? (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="size-4" /> 团队设置
            </DialogTitle>
            <DialogDescription className="sr-only">
              团队成员、主机和项目，来自 WeLink 群目录。
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle>连接团队</DialogTitle>
            <DialogDescription className="sr-only">
              填写群 ID 和群空间 ID 绑定团队。
            </DialogDescription>
          </DialogHeader>
        )}
        {showSpinner ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-label="正在读取团队目录" />
          </div>
        ) : !directory ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid min-w-0 gap-1">
                <small className="text-xs text-muted-foreground">WeLink 群 ID</small>
                <Input
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  inputMode="numeric"
                  autoFocus
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <small className="text-xs text-muted-foreground">群空间 ID</small>
                <Input
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end">
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
          </div>
        ) : (
          <>
            <div className="max-h-[58vh] space-y-3 overflow-y-auto scrollbar-sleek px-0.5">
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border px-2.5 py-2">
                <label className="grid min-w-0 gap-1">
                  <small className="text-xs text-muted-foreground">团队群 ID</small>
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
                <label className="grid min-w-0 gap-1">
                  <small className="text-xs text-muted-foreground">群空间 ID</small>
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
              <TeamSettingsMembers
                hosts={directory.hosts}
                currentMemberId={currentMemberId}
                loading={loading}
                generatingHostId={generatingHostId}
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
                onGenerateHostAddress={(memberId) => void generateHostAddress(memberId)}
              />
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">团队项目</h3>
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProjectRegisterOpen(false)}
                        >
                          取消
                        </Button>
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
                          添加
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setProjectRegisterOpen(true)}
                      >
                        <Plus className="size-3.5" />
                        登记项目
                      </Button>
                    )}
                  </div>
                </div>
                {directory.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">群空间还没有登记团队项目。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm" aria-label="团队项目目录">
                      <thead className="border-b border-border text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-medium">团队项目</th>
                        </tr>
                      </thead>
                      <tbody>
                        {directory.projects.map((project) => (
                          <tr
                            key={project.repo_id}
                            className="border-b border-border/60 last:border-b-0"
                          >
                            <td className="px-2 py-2.5">
                              <div className="text-[13px] font-semibold">
                                {project.name ?? project.repo_id}
                              </div>
                              <div className="mt-0.5 break-all text-xs text-muted-foreground">
                                {project.repository ?? project.repo_id}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <Button type="button" variant="ghost" onClick={() => setFilePreviewOpen(true)}>
                查看群空间文件
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
                保存到群空间
              </Button>
            </div>
            <Dialog open={filePreviewOpen} onOpenChange={setFilePreviewOpen}>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>BW/team.json</DialogTitle>
                  <DialogDescription className="sr-only">
                    当前团队目录将写入群空间的内容。
                  </DialogDescription>
                </DialogHeader>
                <pre className="max-h-[50vh] overflow-auto scrollbar-sleek rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(directory, null, 2)}
                </pre>
              </DialogContent>
            </Dialog>
          </>
        )}
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
